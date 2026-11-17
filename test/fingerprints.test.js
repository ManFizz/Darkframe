const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const ffmpegPath = require('ffmpeg-static');

const S = sandbox.serverPath;
const { phashOf, phashPair, groupSimilar, hamming } = require(S('services', 'phash'));
const { vhashOf, parseVhash, compareVhash } = require(S('services', 'videoHash'));
const keypoints = require(S('services', 'keypoints'));
const { addOutput } = require(S('services', 'onnxPatch'));

const dir = path.join(sandbox.dir, 'fp');
let importService, embeddings, sequelize;

// A picture with enough structure for pHash and keypoints, asymmetric left/right.
function scene(variant) {
    const shapes = variant === 'a'
        ? '<circle cx="200" cy="150" r="90" fill="#f5c542"/><rect x="420" y="260" width="260" height="180" fill="#2a6fdb"/>'
          + '<polygon points="80,450 160,330 240,470" fill="#e44"/><text x="430" y="120" font-size="64" fill="#fff">Abc 123</text>'
        : '<rect x="60" y="60" width="200" height="380" fill="#d33"/><circle cx="560" cy="120" r="70" fill="#1b1"/>'
          + '<text x="300" y="420" font-size="54" fill="#ff0">Zyx 789</text>';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">'
        + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        + '<stop offset="0" stop-color="#123"/><stop offset="1" stop-color="#9bd"/></linearGradient></defs>'
        + '<rect width="800" height="500" fill="url(#g)"/>' + shapes + '</svg>';
    return sharp(Buffer.from(svg)).png().toBuffer();
}

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(dir, { recursive: true });
    importService = require(S('services', 'importService'));
    embeddings = require(S('services', 'embeddings'));
    sequelize = require(S('database'));
});
test.after(() => sandbox.cleanup());

test('mirror hash: a mirrored copy matches through it, the plain hash does not', async () => {
    const a = await scene('a');
    const pair = await phashPair(a);
    assert.equal(pair.phash, await phashOf(a));
    const flipped = await phashOf(await sharp(a).flop().toBuffer());
    assert.ok(hamming(pair.mirror, flipped) <= 4, `mirror distance ${hamming(pair.mirror, flipped)}`);
    assert.ok(hamming(pair.phash, flipped) > 12, 'plain hashes of a picture and its mirror differ');

    const groups = await groupSimilar([
        { id: 'a', phash: pair.phash, mirror: pair.mirror },
        { id: 'flip', phash: flipped, mirror: null },
        { id: 'other', phash: await phashOf(await scene('b')), mirror: null },
    ], 6);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].map(g => g.id).sort(), ['a', 'flip']);
    assert.ok(groups[0].every(g => g.mirrored));
});

test('video fingerprint: re-encoded copy and a cut match, another video does not', async () => {
    const clip = (name, args) => {
        const p = path.join(dir, name);
        execFileSync(ffmpegPath, ['-v', 'error', ...args, '-pix_fmt', 'yuv420p', '-y', p]);
        return p;
    };
    const src = clip('src.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25:duration=8', '-c:v', 'libx264']);
    const small = clip('small.mp4', ['-i', src, '-vf', 'scale=160:120', '-c:v', 'libx264', '-crf', '35']);
    const cut = clip('cut.mp4', ['-ss', '2', '-t', '5', '-i', src, '-c:v', 'libx264']);
    const other = clip('other.mp4', ['-f', 'lavfi', '-i', 'mandelbrot=size=320x240:rate=25', '-t', '8', '-c:v', 'libx264']);

    const [a, b, c, d] = await Promise.all([src, small, cut, other].map(vhashOf));
    assert.match(a, /^\d+\.\d+\|/);
    const fa = parseVhash(a);
    assert.ok(fa.hi.length >= 3);
    assert.notEqual(compareVhash(fa, parseVhash(b), 10), null, 'resized + recompressed');
    assert.notEqual(compareVhash(fa, parseVhash(c), 10), null, 'a cut of it');
    assert.equal(compareVhash(fa, parseVhash(d), 10), null, 'a different video');
    assert.equal(await vhashOf(path.join(dir, 'missing.mp4')), '');
});

test('keypoints: a crop and a mirror are the same picture, another picture is not', async () => {
    const a = await scene('a');
    const files = {
        a: path.join(dir, 'a.png'),
        crop: path.join(dir, 'crop.png'),
        flip: path.join(dir, 'flip.png'),
        b: path.join(dir, 'b.png'),
    };
    fs.writeFileSync(files.a, a);
    await sharp(a).extract({ left: 120, top: 60, width: 520, height: 380 }).resize(400).jpeg({ quality: 70 }).toFile(files.crop);
    await sharp(a).flop().toFile(files.flip);
    fs.writeFileSync(files.b, await scene('b'));

    const m = keypoints.matcher();
    try {
        const crop = await m.same(files.a, files.crop);
        assert.ok(crop.same && !crop.mirrored, `crop: ${JSON.stringify(crop)}`);
        const flip = await m.same(files.a, files.flip);
        assert.ok(flip.same && flip.mirrored, `flip: ${JSON.stringify(flip)}`);
        const other = await m.same(files.a, files.b);
        assert.ok(!other.same, `other: ${JSON.stringify(other)}`);
    } finally { m.close(); }
});

test('onnx patch: one more graph output, the rest of the bytes kept', () => {
    // ModelProto { ir_version: 7 (field 1), graph (field 7): { name: "g" (field 2) } }
    const model = Buffer.from([0x08, 0x07, 0x3a, 0x03, 0x12, 0x01, 0x67]);
    const out = addOutput(model, 'x');
    assert.deepEqual([...out.subarray(0, 2)], [0x08, 0x07]);
    assert.equal(out[2], 0x3a);
    const graph = out.subarray(4, 4 + out[3]);
    assert.deepEqual([...graph.subarray(0, 3)], [0x12, 0x01, 0x67]);
    assert.equal(graph[3], 0x62, 'field 12, length-delimited');
    assert.ok(graph.includes(Buffer.from('x')));
});

test('content vectors: int8 round trip, groups by cosine, stale vectors ignored', async () => {
    const v = Float32Array.from({ length: 768 }, (_, i) => Math.sin(i * 0.37) + (i % 7) / 10);
    const back = embeddings.dequantize(embeddings.quantize(v));
    let dot = 0, n = 0;
    for (let i = 0; i < 768; i++) { dot += v[i] * back[i]; n += v[i] * v[i]; }
    assert.ok(dot / Math.sqrt(n) > 0.999);

    const ids = [];
    for (let k = 0; k < 4; k++) {
        const p = path.join(dir, `img${k}.png`);
        await sharp({ create: { width: 40 + k, height: 40, channels: 3, background: { r: 20 * k, g: 90, b: 160 } } }).png().toFile(p);
        ids.push((await importService.importFile({ filePath: p })).item.id);
    }
    const base = Float32Array.from({ length: 768 }, (_, i) => Math.cos(i * 0.11));
    const near = base.map((x, i) => x + (i % 5 === 0 ? 0.08 : 0));
    const far = Float32Array.from({ length: 768 }, (_, i) => Math.sin(i * 1.7 + 2));
    const put = async (id, vec, hash) => {
        const [[row]] = await sequelize.query('SELECT fileHash FROM Items WHERE id = ?', { replacements: [id] });
        await sequelize.query('INSERT OR REPLACE INTO ItemEmbeddings (itemId, fileHash, vec) VALUES (?, ?, ?)',
            { replacements: [id, hash === undefined ? row.fileHash : hash, embeddings.quantize(vec)] });
    };
    await put(ids[0], base);
    await put(ids[1], near);
    await put(ids[2], far);
    await put(ids[3], base, 'outdated');   // computed for another version of the file

    const st = await embeddings.status();
    assert.equal(st.total, 4);
    assert.equal(st.missing, 1);

    const res = await embeddings.findByContent(0.95);
    assert.equal(res.groups.length, 1);
    assert.deepEqual(res.groups[0].items.map(i => i.id).sort(), [ids[0], ids[1]].sort());
    assert.ok(res.groups[0].items.every(i => i.similarity >= 95));
});
