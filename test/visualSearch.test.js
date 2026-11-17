const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const S = sandbox.serverPath;
let similarity, importService, smartItems;
const src = path.join(sandbox.dir, 'src');

// A picture with some structure (pHash of a flat colour is meaningless).
const scene = (w, h, shift = 0) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 40, b: 60 } } })
    .composite([
        { input: { create: { width: Math.round(w * 0.4), height: Math.round(h * 0.5), channels: 3, background: { r: 230, g: 200, b: 40 } } }, left: Math.round(w * 0.1) + shift, top: Math.round(h * 0.2) },
        { input: { create: { width: Math.round(w * 0.25), height: Math.round(h * 0.3), channels: 3, background: { r: 200, g: 30, b: 90 } } }, left: Math.round(w * 0.6), top: Math.round(h * 0.55) },
    ]);
const importBuf = async (name, buf) => {
    const p = path.join(src, name);
    fs.writeFileSync(p, buf);
    return (await importService.importFile({ filePath: p })).item.id;
};

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(src, { recursive: true });
    similarity = require(S('services', 'similarity'));
    importService = require(S('services', 'importService'));
    smartItems = require(S('services', 'smartItems'));
});
test.after(() => sandbox.cleanup());

test('by item / by bytes / by hash: resized copy found, different picture not', async () => {
    const big = await scene(640, 480).png().toBuffer();
    const a = await importBuf('a.png', big);
    const small = await importBuf('a_small.jpg', await sharp(big).resize(200).jpeg({ quality: 60 }).toBuffer());
    const other = await importBuf('b.png', await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 10, g: 220, b: 220 } } })
        .composite([{ input: { create: { width: 60, height: 250, channels: 3, background: { r: 250, g: 250, b: 250 } } }, left: 200, top: 20 }]).png().toBuffer());
    await similarity.computeMissing();

    const byItem = await similarity.searchByImage({ id: a }, 10);
    const ids = byItem.results.map(r => r.id);
    assert.equal(ids[0], a, 'the picture itself first (distance 0)');
    assert.ok(ids.includes(small), 'resized + recompressed copy is found');
    assert.ok(!ids.includes(other), 'a different picture is not');

    const byBytes = await similarity.searchByImage({ buffer: await sharp(big).resize(320).png().toBuffer() }, 10);
    assert.ok(byBytes.results.some(r => r.id === a));

    const byHash = await similarity.searchByImage({ hash: byItem.hash }, 10);
    assert.deepEqual(byHash.results.map(r => r.id), ids);
});

test('results open as an ordered list', async () => {
    const all = (await smartItems.getSmartItems({})).items.map(i => i.id);
    const reversed = [...all].reverse();
    const res = await smartItems.getSmartItems({ ids: reversed });
    assert.deepEqual(res.items.map(i => i.id), reversed);
});
