const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const S = sandbox.serverPath;
let folderCheck, importService;
const dir = path.join(sandbox.dir, 'disk');
const img = (r) => sharp({ create: { width: 40, height: 30, channels: 3, background: { r, g: 50, b: 50 } } }).png().toBuffer();
const entry = (name) => { const p = path.join(dir, name); const st = fs.statSync(p); return { path: p, size: st.size, mtime: Math.floor(st.mtimeMs) }; };

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(dir, { recursive: true });
    folderCheck = require(S('services', 'folderCheck'));
    importService = require(S('services', 'importService'));
});
test.after(() => sandbox.cleanup());

test('in library / in trash / copies inside the folder / new', async () => {
    const known = await img(10), trashed = await img(20), fresh = await img(30), twin = await img(40);
    for (const [n, b] of [['known.png', known], ['trashed.png', trashed], ['fresh.png', fresh], ['twin_a.png', twin], ['twin_b.png', twin]]) {
        fs.writeFileSync(path.join(dir, n), b);
    }
    await importService.importFile({ filePath: path.join(dir, 'known.png') });
    const { item } = await importService.importFile({ filePath: path.join(dir, 'trashed.png') });
    await require(S('models', 'Item')).unscoped().update({ deletedAt: 1 }, { where: { id: item.id } });

    const files = ['known.png', 'trashed.png', 'fresh.png', 'twin_a.png', 'twin_b.png'].map(entry);
    const res = await folderCheck.checkFiles(files);
    const at = (n) => res[path.join(dir, n)];

    assert.equal(at('known.png').inLibrary.trashed, false);
    assert.equal(at('known.png').inLibrary.collectionName, 'Без коллекции');
    assert.equal(at('trashed.png').inLibrary.trashed, true);
    assert.equal(at('fresh.png'), undefined, 'new file: nothing to report');
    assert.deepEqual(at('twin_a.png').copies, [path.join(dir, 'twin_b.png')]);
});

test('files with a size nobody else has are not even hashed', async () => {
    const big = path.join(dir, 'unique.bin.png');
    fs.writeFileSync(big, Buffer.alloc(123457, 7));
    folderCheck._hashCache.clear();
    await folderCheck.checkFiles([entry('unique.bin.png')]);
    assert.equal(folderCheck._hashCache.has(big), false);
});
