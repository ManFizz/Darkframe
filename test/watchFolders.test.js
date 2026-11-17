const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const S = sandbox.serverPath;
let watchFolders, Item, WatchedFolder;
const inbox = path.join(sandbox.dir, 'inbox');
let n = 0;

const image = (color) => sharp({ create: { width: 32 + (++n), height: 24, channels: 3, background: color } }).png().toBuffer();
const waitFor = async (fn, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 100)); }
    return false;
};

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(inbox, { recursive: true });
    watchFolders = require(S('services', 'watchFolders'));
    watchFolders.opts.stableMs = 200;
    ({ Item } = require(S('models', 'associations')));
    WatchedFolder = require(S('models', 'WatchedFolder'));
});
test.after(() => { watchFolders.stop(); sandbox.cleanup(); });

test('partial downloads are ignored, finished files are candidates', () => {
    assert.equal(watchFolders.isCandidate('C:/x/pic.jpg.crdownload'), false);
    assert.equal(watchFolders.isCandidate('C:/x/video.mp4.part'), false);
    assert.equal(watchFolders.isCandidate('C:/x/notes.txt'), false);
    assert.equal(watchFolders.isCandidate('C:/x/.hidden.png'), false);
    assert.equal(watchFolders.isCandidate('C:/x/pic.JPG'), true);
});

test('catch-up on start imports only files newer than lastScanAt; originals stay', async () => {
    const old = path.join(inbox, 'old.png');
    fs.writeFileSync(old, await image({ r: 200, g: 10, b: 10 }));
    const [row] = await watchFolders.save({ path: inbox, tags: ['Inbox'] });
    // Everything present when the folder was added counts as already seen.
    const fresh = path.join(inbox, 'fresh.png');
    await new Promise(r => setTimeout(r, 30));
    fs.writeFileSync(fresh, await image({ r: 10, g: 200, b: 10 }));

    await watchFolders.start();
    assert.ok(await waitFor(async () => (await Item.count()) === 1), 'one item imported');
    assert.ok(fs.existsSync(fresh) && fs.existsSync(old), 'originals are kept');
    assert.equal((await Item.findOne({ raw: true })).fileName, 'fresh.png');
    const tags = (await require(S('services', 'itemTags')).withTagNames(await Item.findAll({ raw: true })))[0].tags;
    assert.deepEqual(tags, ['inbox']);
    assert.ok(Number((await WatchedFolder.findByPk(row.id)).lastScanAt) > row.lastScanAt);
});

test('a file that finishes downloading while watching is imported once', async () => {
    const before = await Item.count();
    const part = path.join(inbox, 'dl.png.crdownload');
    fs.writeFileSync(part, await image({ r: 10, g: 10, b: 200 }));
    await new Promise(r => setTimeout(r, 600));
    assert.equal(await Item.count(), before, 'nothing imported while still downloading');
    fs.renameSync(part, path.join(inbox, 'dl.png'));
    assert.ok(await waitFor(async () => (await Item.count()) === before + 1), 'imported after rename');
    await new Promise(r => setTimeout(r, 800));
    assert.equal(await Item.count(), before + 1, 'no double import from repeated events');
});

test('import existing picks up files that were there before', async () => {
    const [row] = await watchFolders.list();
    const res = await watchFolders.importExisting(row.id);
    assert.equal(res.imported, 1, 'old.png');
    assert.equal(await Item.count(), 3);
});
