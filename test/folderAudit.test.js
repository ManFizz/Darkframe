const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const S = sandbox.serverPath;
const root = path.join(sandbox.dir, 'audit');
const img = (r) => sharp({ create: { width: 40, height: 30, channels: 3, background: { r, g: 70, b: 70 } } }).png().toBuffer();

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
});
test.after(() => sandbox.cleanup());

test('reports only files that are not in the library, subfolders included', async () => {
    const { importFile } = require(S('services', 'importService'));
    const { auditFolder } = require(S('services', 'folderAudit'));
    const files = { 'known.png': 1, 'sub/new.png': 2, 'sub/twin_a.png': 3, 'sub/twin_b.png': 3 };
    for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(root, n), await img(c * 40));
    fs.writeFileSync(path.join(root, 'notes.txt'), 'not media');
    await importFile({ filePath: path.join(root, 'known.png') });

    const res = await auditFolder(root);
    assert.equal(res.total, 4, 'non-media files are ignored');
    assert.equal(res.inLibrary, 1);
    assert.deepEqual(res.missing.map(m => path.relative(root, m.path).split(path.sep).join('/')),
        ['sub/new.png', 'sub/twin_a.png', 'sub/twin_b.png']);
    assert.equal(res.missing.find(m => m.path.endsWith('twin_a.png')).copies, 1);
    await assert.rejects(() => auditFolder(path.join(root, 'nope')));
});
