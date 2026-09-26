const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const S = sandbox.serverPath;
let importService, Item, libraryEvents;
const srcDir = path.join(sandbox.dir, 'src');

// Solid-colour JPEGs with distinct content (distinct hashes) and chosen mtimes.
async function makeImage(name, rgb, mtimeSec) {
    const p = path.join(srcDir, name);
    await sharp({ create: { width: 64, height: 48, channels: 3, background: rgb } }).jpeg().toFile(p);
    fs.utimesSync(p, mtimeSec, mtimeSec);
    return p;
}

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(srcDir, { recursive: true });
    libraryEvents = require(S('services', 'libraryEvents'));
    libraryEvents.installItemHooks();
    importService = require(S('services', 'importService'));
    ({ Item } = require(S('models', 'associations')));
});
test.after(() => sandbox.cleanup());

test('a batch imports oldest file first with increasing importedAt', async () => {
    // Given in "wrong" order on purpose: newest, oldest, middle.
    const newest = await makeImage('newest.jpg', { r: 200, g: 0, b: 0 }, 1_700_000_300);
    const oldest = await makeImage('oldest.jpg', { r: 0, g: 200, b: 0 }, 1_700_000_100);
    const middle = await makeImage('middle.jpg', { r: 0, g: 0, b: 200 }, 1_700_000_200);

    const { results, skipped, errors } = await importService.importFiles({ filePaths: [newest, oldest, middle], collectionId: null });
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(skipped.length, 0);
    assert.deepEqual(results.map(r => r.title), ['oldest', 'middle', 'newest']);

    const rows = await Item.findAll({ order: [['importedAt', 'ASC']], raw: true });
    assert.deepEqual(rows.map(r => r.title), ['oldest', 'middle', 'newest']);
    assert.ok(rows[0].importedAt < rows[1].importedAt && rows[1].importedAt < rows[2].importedAt);

    // Files land in the sandbox library with a thumbnail next to the original.
    const dir = path.join(sandbox.itemsPath, rows[0].id);
    assert.ok(fs.existsSync(path.join(dir, 'thumb.jpg')));
    assert.ok(fs.readdirSync(dir).some(f => f.startsWith('original')));
    assert.equal(rows[0].width, 64);
    assert.equal(rows[0].mimeType, 'image/jpeg');
});

test('duplicates are skipped by default and added when explicitly allowed', async () => {
    const again = path.join(srcDir, 'oldest.jpg');
    const first = await importService.importFiles({ filePaths: [again], collectionId: null });
    assert.equal(first.results.length, 0);
    assert.equal(first.skipped[0].reason, 'duplicate');

    const forced = await importService.importFiles({ filePaths: [again], collectionId: null, allowDuplicate: true });
    assert.equal(forced.results.length, 1);
});

test('a duplicate of a trashed item is reported as "trashed", not silently restored', async () => {
    const p = await makeImage('trash-me.jpg', { r: 90, g: 90, b: 10 }, 1_700_000_400);
    const { results } = await importService.importFiles({ filePaths: [p], collectionId: null });
    await Item.unscoped().update({ deletedAt: 123 }, { where: { id: results[0].id } });

    const res = await importService.importFiles({ filePaths: [p], collectionId: null });
    assert.equal(res.skipped[0].reason, 'trashed');
    const row = await Item.unscoped().findByPk(results[0].id);
    assert.equal(row.deletedAt, 123, 'must stay in the trash');
});

test('imports notify the UI: coalesced library:changed and import progress', async () => {
    await new Promise(r => setTimeout(r, 1300));   // let earlier tests' coalesced events flush
    sandbox.sent.length = 0;
    const a = await makeImage('ev1.jpg', { r: 1, g: 2, b: 3 }, 1_700_000_500);
    const b = await makeImage('ev2.jpg', { r: 3, g: 2, b: 1 }, 1_700_000_600);
    await importService.importFiles({ filePaths: [a, b], collectionId: null });
    await new Promise(r => setTimeout(r, 1300));   // events are coalesced / throttled

    const changed = sandbox.sent.filter(([ch]) => ch === 'library:changed').map(([, p]) => p);
    assert.ok(changed.length >= 1);
    assert.equal(changed.reduce((n, p) => n + p.added, 0), 2);
    assert.ok(changed.every(p => p.addedTo.includes(null)));

    const activity = sandbox.sent.filter(([ch]) => ch === 'library:importActivity').map(([, p]) => p);
    assert.ok(activity.some(p => p.active && p.total === 2), 'progress while running');
    const last = activity[activity.length - 1];
    assert.equal(last.active, false);
    assert.equal(last.done, 2);
});
