const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { writeTinyTagger } = require('./helpers/tinyTagger');

const S = sandbox.serverPath;
let autotag, importService;
const src = path.join(sandbox.dir, 'src');
const modelDir = path.join(sandbox.dir, 'model');
const solid = async (name, rgb) => {
    const p = path.join(src, name);
    await sharp({ create: { width: 120, height: 80, channels: 3, background: rgb } }).png().toFile(p);
    return (await importService.importFile({ filePath: p })).item.id;
};

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(src, { recursive: true });
    writeTinyTagger(modelDir);
    autotag = require(S('services', 'autotag'));
    autotag.setModelDir(modelDir);
    importService = require(S('services', 'importService'));
});
test.after(() => sandbox.cleanup());

test('status reports the installed model', () => {
    assert.equal(autotag.status().installed, true);
});

test('suggestions follow the picture; character tags need the higher threshold', async () => {
    const red = await solid('red.png', { r: 250, g: 10, b: 10 });
    const blue = await solid('blue.png', { r: 10, g: 10, b: 250 });
    const res = await autotag.suggest([red, blue]);
    assert.deepEqual(res[red].map(t => t.name), ['red_theme']);
    assert.equal(res[red][0].category, 'general');
    assert.deepEqual(res[blue].map(t => t.name), ['blue_theme']);
    assert.equal(res[blue][0].category, 'character');
    // ratings (category 9) are never suggested as tags
    assert.ok(!Object.values(res).flat().some(t => t.name === 'general'));
});

test('tags the item already has are not suggested again', async () => {
    const id = await solid('red2.png', { r: 240, g: 20, b: 15 });
    const { ItemTag } = require(S('models', 'associations'));
    const tag = await importService.ensureTag('red_theme');
    await ItemTag.create({ itemId: id, tagId: tag.id });
    const res = await autotag.suggest([id]);
    assert.deepEqual(res[id], []);
});
