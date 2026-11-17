const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const fsBrowser = require('../server/services/fsBrowser');
const fsThumbs = require('../server/services/fsThumbs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darkframe-fs-'));
const cache = path.join(root, '_cache');

const png = (file, w = 120, h = 80) => sharp({ create: { width: w, height: h, channels: 3, background: '#3a6' } }).png().toFile(file);

test.before(async () => {
    // root/ a.jpg  b.png  clip.mp4(empty)  notes.txt  desktop.ini  sub/ (3 imgs + deeper/)  empty/
    await sharp({ create: { width: 200, height: 100, channels: 3, background: '#a33' } }).jpeg().toFile(path.join(root, 'a.jpg'));
    await png(path.join(root, 'b.png'));
    fs.writeFileSync(path.join(root, 'clip.mp4'), '');
    fs.writeFileSync(path.join(root, 'notes.txt'), 'x');
    fs.writeFileSync(path.join(root, 'desktop.ini'), 'x');
    fs.mkdirSync(path.join(root, 'sub', 'deeper'), { recursive: true });
    for (const n of ['img10.png', 'img2.png', 'img1.png', 'img3.png']) await png(path.join(root, 'sub', n));
    fs.mkdirSync(path.join(root, 'empty'));
});
test.after(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } });

test('mediaKind by extension', () => {
    assert.equal(fsBrowser.mediaKind('x.JPG'), 'image');
    assert.equal(fsBrowser.mediaKind('x.gif'), 'gif');
    assert.equal(fsBrowser.mediaKind('x.webm'), 'video');
    assert.equal(fsBrowser.mediaKind('x.txt'), 'other');
});

test('listDir: media files with metadata, folders with a peek, junk skipped', () => {
    const res = fsBrowser.listDir(root);
    assert.equal(res.path, path.resolve(root));
    assert.equal(res.parent, path.dirname(path.resolve(root)));

    assert.deepEqual(res.files.map(f => f.name).sort(), ['a.jpg', 'b.png', 'clip.mp4']);
    const a = res.files.find(f => f.name === 'a.jpg');
    assert.equal(a.kind, 'image');
    assert.equal(a.ext, 'jpg');
    assert.ok(a.size > 0 && a.mtime > 0);
    assert.equal(res.files.find(f => f.name === 'clip.mp4').kind, 'video');

    assert.equal(res.stats.otherFiles, 1, 'notes.txt counted, desktop.ini skipped');
    assert.equal(res.stats.files, 3);

    assert.deepEqual(res.folders.map(f => f.name), ['empty', 'sub']);
    const sub = res.folders.find(f => f.name === 'sub');
    assert.equal(sub.files, 4);
    assert.equal(sub.dirs, 1);
    // natural order, first three
    assert.deepEqual(sub.previews.map(p => path.basename(p)), ['img1.png', 'img2.png', 'img3.png']);
    assert.deepEqual(res.folders.find(f => f.name === 'empty').previews, []);

    // A folder with only sub-folders borrows previews from one level down.
    const nested = fsBrowser.peekDir(path.join(root, '..', path.basename(root)));
    assert.ok(nested.previews.length >= 1);
});

test('listDir on a missing folder throws ENOENT', () => {
    assert.throws(() => fsBrowser.listDir(path.join(root, 'nope')), { code: 'ENOENT' });
});

test('listDrives lists roots without touching slow drives', async () => {
    const t0 = Date.now();
    const drives = await fsBrowser.listDrives();
    assert.ok(drives.length >= 1);
    assert.ok(drives.some(d => d.path.toUpperCase().startsWith(os.homedir().slice(0, 2).toUpperCase()) || d.path === '/'));
    assert.ok(Date.now() - t0 < 9000);
});

test('getThumb: generates once, then serves the cache; new content → new thumb', async () => {
    const file = path.join(root, 'a.jpg');
    const t1 = await fsThumbs.getThumb(file, cache, 100);
    assert.ok(t1 && fs.existsSync(t1));
    const meta = await sharp(t1).metadata();
    assert.equal(meta.format, 'jpeg');
    assert.equal(meta.width, 100);

    const t2 = await fsThumbs.getThumb(file, cache, 100);
    assert.equal(t2, t1, 'cached');

    await new Promise(r => setTimeout(r, 20));
    await sharp({ create: { width: 300, height: 300, channels: 3, background: '#00f' } }).jpeg().toFile(file);
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
    const t3 = await fsThumbs.getThumb(file, cache, 100);
    assert.notEqual(t3, t1);
});

test('getThumb returns null for non-media and broken files; concurrent calls share one job', async () => {
    assert.equal(await fsThumbs.getThumb(path.join(root, 'notes.txt'), cache), null);
    assert.equal(await fsThumbs.getThumb(path.join(root, 'clip.mp4'), cache), null);   // empty video
    const file = path.join(root, 'b.png');
    const [x, y] = await Promise.all([fsThumbs.getThumb(file, cache, 200), fsThumbs.getThumb(file, cache, 200)]);
    assert.equal(x, y);
});

test('mediaInfo reads image dimensions', async () => {
    const info = await fsThumbs.mediaInfo(path.join(root, 'b.png'));
    assert.equal(info.width, 120);
    assert.equal(info.height, 80);
});

test('pruneCache keeps the cache under the limit', async () => {
    const res = await fsThumbs.pruneCache(cache, 1);
    assert.ok(res.removed >= 1);
});
