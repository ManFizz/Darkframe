const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const S = sandbox.serverPath;
let importService, autoRules, Item, Collection;
const src = path.join(sandbox.dir, 'src');
let n = 0;

async function makeImage() {
    const p = path.join(src, `img${++n}.jpg`);
    await sharp({ create: { width: 40 + n, height: 30, channels: 3, background: { r: n * 20 % 255, g: 90, b: 140 } } }).jpeg().toFile(p);
    return p;
}
const tagsOf = async (id) => (await require(S('services', 'itemTags')).withTagNames(await Item.findAll({ where: { id }, raw: true })))[0].tags;

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(src, { recursive: true });
    importService = require(S('services', 'importService'));
    autoRules = require(S('services', 'autoRules'));
    ({ Item } = require(S('models', 'associations')));
    Collection = require(S('models', 'Collection'));
});
test.after(() => sandbox.cleanup());

test('a matching rule tags and files a new import; a non-matching one does not', async () => {
    const col = await Collection.create({ id: require('uuid').v4(), name: 'Pixiv' });
    await autoRules.save({
        name: 'pixiv',
        rules: { op: 'all', items: [{ field: 'source', cmp: 'is', value: 'pixiv.net' }] },
        addTags: ['pixiv', 'art'],
        collectionId: col.id,
        rating: 6,
    });

    const hit = await importService.importFile({ filePath: await makeImage(), sourceUrl: 'https://www.pixiv.net/artworks/1' });
    assert.deepEqual(hit.rulesApplied, ['pixiv']);
    const row = await Item.findByPk(hit.item.id);
    assert.equal(row.collectionId, col.id);
    assert.equal(row.rating, 6);
    assert.deepEqual((await tagsOf(hit.item.id)).sort(), ['art', 'pixiv']);

    const miss = await importService.importFile({ filePath: await makeImage(), sourceUrl: 'https://x.com/a' });
    assert.deepEqual(miss.rulesApplied, []);
    assert.deepEqual(await tagsOf(miss.item.id), []);
});

test('API-only rules ignore app imports; rules chain in order', async () => {
    await autoRules.save({
        name: 'api',
        apiOnly: true,
        rules: { op: 'all', items: [{ field: 'type', cmp: 'is', value: 'image' }] },
        addTags: ['from_api'],
    });
    await autoRules.save({
        name: 'chain',
        rules: { op: 'all', items: [{ field: 'tag', cmp: 'has', value: 'from_api' }] },
        addTags: ['chained'],
    });

    const app = await importService.importFile({ filePath: await makeImage() });
    assert.ok(!(await tagsOf(app.item.id)).includes('from_api'));

    const api = await importService.importFile({ filePath: await makeImage(), origin: 'api' });
    const tags = await tagsOf(api.item.id);
    assert.ok(tags.includes('from_api'));
    assert.ok(tags.includes('chained'), 'second rule sees the first rule’s tag');
});

test('preview + apply to existing items; disabled rules are skipped', async () => {
    const rule = { rules: { op: 'all', items: [{ field: 'tag', cmp: 'not', value: 'reviewed' }] }, addTags: ['reviewed'] };
    const pv = await autoRules.preview(rule);
    const total = await Item.count();
    assert.equal(pv.matched, total);
    assert.equal(pv.changed, total);

    const list = await autoRules.save({ name: 'review', enabled: false, ...rule });
    const saved = list.find(r => r.name === 'review');
    const fresh = await importService.importFile({ filePath: await makeImage() });
    assert.ok(!(await tagsOf(fresh.item.id)).includes('reviewed'), 'disabled rule does not run on import');

    const res = await autoRules.applyToExisting(saved.id);
    assert.equal(res.changed, total + 1);
    assert.equal((await autoRules.preview(rule)).changed, 0);
});
