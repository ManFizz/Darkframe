const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const S = sandbox.serverPath;
let registry, librarySwitch, importService, Item, Collection, second;
const src = path.join(sandbox.dir, 'src');
let n = 0;
const makeImage = async () => {
    const p = path.join(src, `img${++n}.png`);
    await sharp({ create: { width: 30 + n, height: 20, channels: 3, background: { r: n * 40, g: 60, b: 90 } } }).png().toFile(p);
    return p;
};

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(src, { recursive: true });
    registry = require(S('libraryRegistry'));
    librarySwitch = require(S('services', 'librarySwitch'));
    importService = require(S('services', 'importService'));
    ({ Item } = require(S('models', 'associations')));
    Collection = require(S('models', 'Collection'));
    second = registry.addLibrary({ name: 'Second', folderPath: path.join(sandbox.dir, 'second') });
});
test.after(() => { require(S('services', 'watchFolders')).stop(); return sandbox.cleanup(); });

test('switching re-points the database and the items folder without a restart', async () => {
    await importService.importFile({ filePath: await makeImage() });
    assert.equal(await Item.count(), 1);
    const firstItems = importService.itemsPath();

    const res = await librarySwitch.switchLibrary(second.id);
    assert.equal(res.changed, true);
    assert.equal(registry.getActive().id, second.id);
    assert.equal(importService.itemsPath(), second.itemsPath);
    assert.notEqual(importService.itemsPath(), firstItems);

    // Fresh database: schema + migrations ran, built-in favourites collection exists.
    assert.equal(await Item.count(), 0);
    assert.ok(await Collection.count() >= 1);

    const { item } = await importService.importFile({ filePath: await makeImage() });
    assert.ok(fs.existsSync(path.join(second.itemsPath, item.id)), 'files land in the new library');
    assert.equal(await Item.count(), 1);

    await librarySwitch.switchLibrary('test');
    assert.equal(importService.itemsPath(), firstItems);
    const titles = (await Item.findAll({ raw: true })).map(r => r.fileName);
    assert.deepEqual(titles, ['img1.png'], 'back on the first library, untouched');
});

test('an unknown library is refused and nothing changes', async () => {
    await assert.rejects(librarySwitch.switchLibrary('nope'), /не найдена/);
    assert.equal(registry.getActive().id, 'test');
    assert.equal(await Item.count(), 1);
});
