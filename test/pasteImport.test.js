const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const sharp = require('sharp');

const S = sandbox.serverPath;
const electron = require(require.resolve('electron', { paths: [sandbox.ROOT] }));
let pasteImport, Item, server, port;
const src = path.join(sandbox.dir, 'src');

// Fake clipboard: set what the next paste sees.
let clip = {};
electron.clipboard = {
    readBuffer: (fmt) => (fmt === 'FileNameW' && clip.file ? Buffer.from(clip.file + '\0', 'utf16le') : Buffer.alloc(0)),
    readImage: () => ({ isEmpty: () => !clip.png, toPNG: () => clip.png }),
    readText: () => clip.text || '',
};
const png = (r) => sharp({ create: { width: 33, height: 21, channels: 3, background: { r, g: 90, b: 20 } } }).png().toBuffer();

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(src, { recursive: true });
    ({ pasteImport } = require(S('services', 'pasteImport')));
    ({ Item } = require(S('models', 'associations')));
    const served = await png(200);
    server = http.createServer((req, res) => { res.setHeader('Content-Type', 'image/png'); res.end(served); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
});
test.after(() => { server?.close(); return sandbox.cleanup(); });

test('nothing usable → kind null', async () => {
    clip = { text: 'просто текст без ссылок' };
    const res = await pasteImport({});
    assert.equal(res.kind, null);
    assert.equal(res.results.length, 0);
});

test('a copied file is imported, the original stays', async () => {
    const p = path.join(src, 'copied.png');
    fs.writeFileSync(p, await png(10));
    clip = { file: p };
    const res = await pasteImport({});
    assert.equal(res.kind, 'files');
    assert.equal(res.results.length, 1);
    assert.ok(fs.existsSync(p));
});

test('an image on the clipboard becomes a "Вставка …" item', async () => {
    clip = { png: await png(60) };
    const res = await pasteImport({});
    assert.equal(res.kind, 'image');
    const row = await Item.findByPk(res.results[0].id, { raw: true });
    assert.match(row.title, /^Вставка \d{4}-\d{2}-\d{2}/);
});

test('links in the text are downloaded', async () => {
    clip = { text: `смотри http://127.0.0.1:${port}/pic.png и ещё раз http://127.0.0.1:${port}/pic.png` };
    const res = await pasteImport({});
    assert.equal(res.kind, 'links');
    assert.equal(res.results.length, 1, 'the same link twice is fetched once');
});
