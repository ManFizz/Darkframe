const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const S = sandbox.serverPath;
let mirror, importService, Item, Collection;
const src = path.join(sandbox.dir, 'mirror-src');
const root = path.join(sandbox.dir, 'Библиотека');

const ls = (dir = root) => {
    const out = [];
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p); else out.push(path.relative(root, p).split(path.sep).join('/'));
        }
    };
    if (fs.existsSync(dir)) walk(dir);
    return out.sort();
};
const ino = (p) => fs.statSync(p, { bigint: true }).ino;

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(src, { recursive: true });
    mirror = require(S('services', 'explorerMirror'));
    importService = require(S('services', 'importService'));
    Item = require(S('models', 'Item'));
    Collection = require(S('models', 'Collection'));
});
test.after(() => sandbox.cleanup());

async function img(name, color) {
    const p = path.join(src, name);
    await sharp({ create: { width: 20, height: 20, channels: 3, background: color } }).png().toFile(p);
    return (await importService.importFile({ filePath: p })).item;
}

test('names: forbidden characters, reserved names, length', () => {
    assert.equal(mirror.cleanName('a/b:c*?"<>|d.', 50), 'a b c d');
    assert.equal(mirror.cleanName('CON', 50), '_CON');
    assert.equal(mirror.cleanName('   ', 50), 'Без названия');
    assert.equal([...mirror.cleanName('я'.repeat(200), 10)].length, 10);
});

test('mirror: collections as folders, hard links, follows renames / moves / trash, keeps foreign files', async () => {
    const stars = await Collection.create({ name: 'Stars' });
    const sub = await Collection.create({ name: 'Sub: one', parentId: stars.id });
    const a = await img('a.png', { r: 200, g: 0, b: 0 });
    const b = await img('b.png', { r: 0, g: 200, b: 0 });
    const c = await img('c.png', { r: 0, g: 0, b: 200 });
    await Item.update({ title: 'Same', collectionId: stars.id }, { where: { id: [a.id, b.id] } });
    await Item.update({ title: 'Deep', collectionId: sub.id }, { where: { id: c.id } });
    const loose = await img('d.png', { r: 9, g: 9, b: 9 });

    // A non-empty folder that isn't ours is refused.
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'mine.txt'), 'x');
    await assert.rejects(mirror.setConfig({ enabled: true, path: root }), /не пустая/);
    fs.unlinkSync(path.join(root, 'mine.txt'));

    let st = await mirror.setConfig({ enabled: true, path: root });
    assert.equal(st.lastError, null);
    assert.deepEqual(ls(), ['Stars/Same (2).png', 'Stars/Same.png', 'Stars/Sub one/Deep.png', 'Без коллекции/d.png']);
    const orig = fs.readdirSync(path.join(sandbox.itemsPath, c.id)).find(f => f.startsWith('original'));
    assert.equal(ino(path.join(root, 'Stars/Sub one/Deep.png')), ino(path.join(sandbox.itemsPath, c.id, orig)));

    // The user's own file in the mirror survives every sync.
    fs.writeFileSync(path.join(root, 'Stars', 'note.txt'), 'keep me');

    await Item.update({ title: 'Renamed' }, { where: { id: c.id } });
    await Item.update({ collectionId: null }, { where: { id: b.id } });
    await Item.update({ deletedAt: Math.floor(Date.now() / 1000) }, { where: { id: loose.id } });
    await Collection.update({ name: 'Stars 2' }, { where: { id: stars.id } });
    st = await mirror.syncAndWait();
    assert.deepEqual(ls(), ['Stars 2/Same.png', 'Stars 2/Sub one/Renamed.png', 'Stars/note.txt', 'Без коллекции/Same.png']);

    // A link deleted by hand is put back by a full check.
    fs.unlinkSync(path.join(root, 'Stars 2/Same.png'));
    await mirror.syncAndWait({ full: true });
    assert.ok(fs.existsSync(path.join(root, 'Stars 2/Same.png')));

    // Off: our links and folders go, the library and the user's file stay.
    st = await mirror.setConfig({ enabled: false, path: root });
    assert.deepEqual(ls(), ['Stars/note.txt']);
    assert.ok(fs.existsSync(path.join(sandbox.itemsPath, c.id, orig)));
    assert.equal(st.enabled, false);
    assert.equal(st.lastError, null);
});

test('mirror: refuses a folder inside the library', async () => {
    await assert.rejects(mirror.setConfig({ enabled: true, path: path.join(sandbox.itemsPath, 'x') }), /внутри/);
});
