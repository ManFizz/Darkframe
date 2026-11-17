const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const S = sandbox.serverPath;
let journal, importService, Item, Collection, tagsOf;
const src = path.join(sandbox.dir, 'src');
let n = 0;
const makeImage = async () => {
    const p = path.join(src, `u${++n}.png`);
    await sharp({ create: { width: 20 + n, height: 20, channels: 3, background: { r: n * 30, g: 10, b: 200 } } }).png().toFile(p);
    return (await importService.importFile({ filePath: p })).item.id;
};
const row = (id) => Item.unscoped().findByPk(id, { raw: true });

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(src, { recursive: true });
    journal = require(S('services', 'undoJournal'));
    importService = require(S('services', 'importService'));
    ({ Item } = require(S('models', 'associations')));
    Collection = require(S('models', 'Collection'));
    const { withTagNames } = require(S('services', 'itemTags'));
    tagsOf = async (id) => (await withTagNames([{ id }]))[0].tags.sort();
});
test.after(() => sandbox.cleanup());

test('rating: undo restores, redo re-applies, a new edit clears redo', async () => {
    const id = await makeImage();
    await journal.around('оценка', [id], ['rating'], false, () => Item.update({ rating: 7 }, { where: { id } }));
    assert.equal((await row(id)).rating, 7);

    assert.equal((await journal.undo()).label, 'оценка');
    assert.ok(!(await row(id)).rating);
    await journal.redo();
    assert.equal((await row(id)).rating, 7);

    await journal.undo();
    await journal.around('оценка', [id], ['rating'], false, () => Item.update({ rating: 3 }, { where: { id } }));
    assert.equal(await journal.redo(), null, 'redo is gone after a new edit');
});

test('move + tags on several items come back together', async () => {
    const a = await makeImage(), b = await makeImage();
    const col = await Collection.create({ id: require('uuid').v4(), name: 'Box' });
    const { ensureTag } = importService;
    const { ItemTag } = require(S('models', 'associations'));
    await journal.around(journal.describe({ collectionId: col.id }, true, 2), [a, b], ['collectionId', 'order'], true, async () => {
        await Item.update({ collectionId: col.id }, { where: { id: [a, b] } });
        for (const id of [a, b]) await ItemTag.create({ itemId: id, tagId: (await ensureTag('boxed')).id });
    });
    assert.equal((await row(a)).collectionId, col.id);
    assert.deepEqual(await tagsOf(b), ['boxed']);

    const res = await journal.undo();
    assert.equal(res.label, 'перемещение, теги · 2 файлов');
    for (const id of [a, b]) {
        assert.equal((await row(id)).collectionId, null);
        assert.deepEqual(await tagsOf(id), []);
    }
});

test('trash and imports: undo of an import sends it to the trash, redo brings it back', async () => {
    const id = await makeImage();
    journal.recordCreated('импорт', [id]);
    await journal.undo();
    assert.ok((await row(id)).deletedAt, 'imported item is in the trash');
    await journal.redo();
    assert.equal((await row(id)).deletedAt, null);

    await journal.around('удаление в корзину', [id], ['deletedAt'], false, () =>
        Item.update({ deletedAt: 123 }, { where: { id } }));
    await journal.undo();
    assert.equal((await row(id)).deletedAt, null);
});

test('events: undo tells the views to reload', async () => {
    const before = sandbox.sent.length;
    const id = await makeImage();
    await journal.around('название', [id], ['title'], false, () => Item.update({ title: 'x' }, { where: { id } }));
    await journal.undo();
    assert.ok(sandbox.sent.slice(before).some(([ch, p]) => ch === 'library:changed' && p.reload));
});
