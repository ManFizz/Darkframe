const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const sharp = require('sharp');
const { execFileSync } = require('child_process');

// Broken downloads (a picture with a grey / green half, a video cut short) are
// recognised and downloaded again — up to 3 times — before the import gives up.
const S = sandbox.serverPath;
let jpeg, png, mp4, server, base;
let served = {};   // path → how many times asked
let brokenFor = {};   // path → serve a cut copy this many times

test.before(async () => {
    await sandbox.initDb();
    const noise = Buffer.alloc(240 * 180 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
    jpeg = await sharp(noise, { raw: { width: 240, height: 180, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
    png = await sharp(noise, { raw: { width: 240, height: 180, channels: 3 } }).png().toBuffer();
    const v = path.join(sandbox.dir, 'clip.mp4');
    execFileSync(require('ffmpeg-static'), ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10', '-t', '4',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', v], { stdio: 'ignore' });
    mp4 = fs.readFileSync(v);

    server = http.createServer((req, res) => {
        const p = req.url;
        served[p] = (served[p] || 0) + 1;
        if (p.startsWith('/missing')) { res.writeHead(404); res.end(); return; }
        const body = p.startsWith('/pic') ? jpeg : p.startsWith('/img') ? png : mp4;
        const cut = served[p] <= (brokenFor[p] || 0);
        // A broken copy: the same headers, the data stops at 60%.
        res.writeHead(200, { 'Content-Type': p.endsWith('.mp4') ? 'video/mp4' : p.endsWith('.png') ? 'image/png' : 'image/jpeg', ...(cut && p.includes('nolen') ? {} : { 'Content-Length': body.length }) });
        // with a length: the connection drops; without one: the response just ends early
        if (cut && p.includes('nolen')) res.end(body.subarray(0, Math.floor(body.length * 0.6)));
        else if (cut) { res.write(body.subarray(0, Math.floor(body.length * 0.6))); res.destroy(); }
        else res.end(body);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); return sandbox.cleanup(); });

test('check: whole files pass, cut pictures and videos are caught', async () => {
    const { checkMedia } = require(S('services', 'mediaCheck'));
    const put = (name, buf) => { const f = path.join(sandbox.dir, name); fs.writeFileSync(f, buf); return f; };
    assert.equal(await checkMedia(put('ok.jpg', jpeg)), null);
    assert.equal(await checkMedia(put('ok.png', png)), null);
    assert.equal(await checkMedia(put('ok.mp4', mp4)), null);
    assert.match(await checkMedia(put('cut.jpg', jpeg.subarray(0, jpeg.length * 0.6))), /обрезана|повреждена/);
    assert.match(await checkMedia(put('cut.png', png.subarray(0, png.length * 0.6))), /обрезана|повреждена/);
    assert.match(await checkMedia(put('cut.mp4', mp4.subarray(0, mp4.length * 0.5))), /видео/);
    assert.match(await checkMedia(put('short.jpg', jpeg), { expectedSize: jpeg.length + 10 }), /скачано/);
    assert.equal(await checkMedia(put('typed.download', jpeg), { ext: '.jpg' }), null);
    assert.match(await checkMedia(put('typed2.download', jpeg.subarray(0, 900)), { ext: '.jpg' }), /обрезана|повреждена/);
});

test('import from a link: a broken copy is downloaded again; three broken ones — not imported', async () => {
    const { importFromUrl } = require(S('services', 'urlImportService'));
    const { Item } = require(S('models', 'associations'));

    // no length announced, cut twice → the third copy is whole and gets imported
    brokenFor['/pic-nolen.jpg'] = 2;
    const ok = await importFromUrl({ url: `${base}/pic-nolen.jpg` });
    assert.equal(ok.errors.length, 0, JSON.stringify(ok.errors));
    assert.equal(served['/pic-nolen.jpg'], 3);
    const item = await Item.findByPk(ok.results[0].id, { raw: true });
    assert.equal(item.width, 240);

    // a video cut once (connection dropped mid-way)
    brokenFor['/clip.mp4'] = 1;
    const v = await importFromUrl({ url: `${base}/clip.mp4` });
    assert.equal(v.errors.length, 0, JSON.stringify(v.errors));
    assert.equal(served['/clip.mp4'], 2);

    // always broken → an error, nothing in the library
    brokenFor['/img-nolen.png'] = 99;
    const before = await Item.count();
    const bad = await importFromUrl({ url: `${base}/img-nolen.png` });
    assert.equal(bad.results.length, 0);
    assert.match(bad.errors[0].error, /повреждённым \(3 попытки\)/);

    // the connection drops every time → the same clear message
    brokenFor['/pic-drop.jpg'] = 99;
    const drop = await importFromUrl({ url: `${base}/pic-drop.jpg` });
    assert.match(drop.errors[0].error, /целиком.*3 попытки/);
    // a missing file (404) is not retried
    const gone = await importFromUrl({ url: `${base}/missing.jpg` });
    assert.equal(gone.results.length, 0);
    assert.equal(served['/missing.jpg'], 1);
    assert.equal(served['/img-nolen.png'], 3);
    assert.equal(await Item.count(), before);
});
