const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const { v4: uuid } = require('uuid');

const S = sandbox.serverPath;
let sequelize, Item, Tag, ItemTag, Collection;

test.before(async () => {
    sequelize = await sandbox.initDb();
    ({ Item, Tag, ItemTag } = require(S('models', 'associations')));
    Collection = require(S('models', 'Collection'));
});
test.after(() => sandbox.cleanup());

const addItem = (over = {}) => Item.create({
    id: uuid(), fileName: 'a.jpg', mimeType: 'image/jpeg', order: 0, ...over,
});

test('a fresh database gets the full schema and lookup indexes', async () => {
    const qi = sequelize.getQueryInterface();
    const items = await qi.describeTable('Items');
    for (const col of ['order', 'editedAt', 'deletedAt', 'fileHash', 'phash', 'editParams', 'thumbAt']) {
        assert.ok(items[col], `Items.${col} missing`);
    }
    assert.ok((await qi.describeTable('Tags')).pinned, 'Tags.pinned missing');

    const [idx] = await sequelize.query("SELECT name FROM sqlite_master WHERE type = 'index'");
    const names = idx.map(r => r.name);
    for (const n of ['tags_pinned_idx', 'itemtags_tagId_idx', 'items_collectionId_idx', 'items_deletedAt_idx', 'items_fileHash_idx']) {
        assert.ok(names.includes(n), `index ${n} missing`);
    }
});

test('migrations are idempotent (second startup)', async () => {
    await require(S('migrations')).migrations();
});

test('the Tag model is loaded once (no case-mismatched require duplicates)', () => {
    const tagService = require(S('services', 'tagService'));
    assert.ok(tagService);
    const tagModules = Object.keys(require.cache).filter(k => /[\\/]server[\\/]models[\\/]tag\.js$/i.test(k));
    assert.equal(tagModules.length, 1, tagModules.join('\n'));
});

test('saveTags stores fetched remote tags and upserts by name', async () => {
    const { saveTags, getTagsByNames } = require(S('services', 'tagService'));
    // Same shape the renderer's TagsController sends (id: null, numeric type).
    await saveTags([
        { id: null, name: 'landscape', type: 0, count: 5000, remoteType: 2 },
        { id: null, name: 'some_artist', type: 1, count: 12, remoteType: 2 },
        { id: null, name: 'no_type', type: null, count: 1, remoteType: 2 },   // ignored
    ]);
    let rows = await getTagsByNames(['landscape', 'some_artist', 'no_type']);
    assert.deepEqual(rows.map(r => r.name).sort(), ['landscape', 'some_artist']);

    await saveTags([{ id: null, name: 'landscape', type: 0, count: 9999, remoteType: 2 }]);
    rows = await getTagsByNames(['landscape']);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].count, 9999);
});

test('getAllTags lists library tags only, with live counts', async () => {
    const tagAdmin = require(S('services', 'tagAdmin'));
    const used = await Tag.create({ name: 'used_tag', remoteType: 6 });
    const trashedOnly = await Tag.create({ name: 'trashed_only', remoteType: 6 });
    await Tag.create({ name: 'remote_cache_only', remoteType: 2 });
    const pinned = await Tag.create({ name: 'pinned_tag', remoteType: 6, pinned: true });

    const live = await addItem();
    const trashed = await addItem({ deletedAt: 1 });
    await ItemTag.bulkCreate([
        { itemId: live.id, tagId: used.id },
        { itemId: trashed.id, tagId: used.id },
        { itemId: trashed.id, tagId: trashedOnly.id },
    ]);

    const all = await tagAdmin.getAllTags();
    const byName = Object.fromEntries(all.map(t => [t.name, t]));
    assert.equal(byName.used_tag.count, 1, 'trashed items must not count');
    assert.equal(byName.trashed_only.count, 0);
    assert.ok(byName.pinned_tag.pinned);
    assert.equal(all[0].name, pinned.name, 'pinned first');
    assert.equal(byName.remote_cache_only, undefined, 'remote tag cache must stay out');
    assert.equal(byName.landscape, undefined);
});

test('withTagNames attaches tag names in link order, empty list for untagged', async () => {
    const { withTagNames } = require(S('services', 'itemTags'));
    const a = await Tag.create({ name: 'alpha', remoteType: 6 });
    const b = await Tag.create({ name: 'beta', remoteType: 6 });
    const tagged = await addItem();
    const bare = await addItem();
    await ItemTag.bulkCreate([{ itemId: tagged.id, tagId: b.id }, { itemId: tagged.id, tagId: a.id }]);

    const rows = await withTagNames(await Item.findAll({ where: { id: [tagged.id, bare.id] }, raw: true }));
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    assert.deepEqual(byId[tagged.id].tags, ['beta', 'alpha']);
    assert.deepEqual(byId[bare.id].tags, []);
});

test('default scope hides trashed items; smart collection query sees tags', async () => {
    const { getSmartItems } = require(S('services', 'smartItems'));
    const t = await Tag.create({ name: 'smart_tag', remoteType: 6 });
    const hit = await addItem({ rating: 8 });
    const gone = await addItem({ rating: 8, deletedAt: 5 });
    await ItemTag.bulkCreate([{ itemId: hit.id, tagId: t.id }, { itemId: gone.id, tagId: t.id }]);

    const { items } = await getSmartItems({ tags: [{ name: 'smart_tag' }], ratingMin: 7 });
    assert.deepEqual(items.map(i => i.id), [hit.id]);
    assert.deepEqual(items[0].tags, ['smart_tag']);
    assert.match(items[0].thumbPath, /^library:\/\/thumb\//);
});

test('collection counts come from one grouped query', async () => {
    const col = await Collection.create({ id: uuid(), name: 'Counted' });
    await addItem({ collectionId: col.id });
    await addItem({ collectionId: col.id });
    await addItem({ collectionId: col.id, deletedAt: 9 });   // trashed: not counted
    const rows = await Item.findAll({
        attributes: ['collectionId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
        where: { collectionId: col.id }, group: ['collectionId'], raw: true,
    });
    assert.equal(Number(rows[0].n), 2);
});

test('duplicate saved booru tags are merged on startup and can no longer appear', async () => {
    const FavoriteTag = require(S('models', 'FavoriteTag'));
    await sequelize.query('DROP INDEX IF EXISTS favtags_tag_source_uq');
    await FavoriteTag.bulkCreate([
        { tag: 'dup_tag', remote_type: 2, display: 1 },
        { tag: 'dup_tag', remote_type: 2, display: 5 },
        { tag: 'dup_tag', remote_type: 4, display: 1 },   // other source: kept
    ]);
    await require(S('migrations')).migrations();

    const rows = await FavoriteTag.findAll({ where: { tag: 'dup_tag' }, raw: true });
    assert.equal(rows.filter(r => r.remote_type === 2).length, 1);
    assert.equal(rows.filter(r => r.remote_type === 4).length, 1);
    assert.equal(rows.find(r => r.remote_type === 2).display, 1, 'the first copy survives');
    await assert.rejects(FavoriteTag.create({ tag: 'dup_tag', remote_type: 2 }));
});
