const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { zipSync, unzipSync, strToU8 } = require('fflate');

const S = sandbox.serverPath;
let store, convert, importService, Item;
const src = path.join(sandbox.dir, 'src');

const page = (dir, name, r, h = 300) => {
    const p = path.join(dir, name);
    fs.mkdirSync(dir, { recursive: true });
    return sharp({ create: { width: 200, height: h, channels: 3, background: { r, g: 40, b: 90 } } }).jpeg().toFile(p).then(() => p);
};
const pages = (id) => store.bookOf(id).chapters.flatMap(c => c.pages.map(p => p.file));

test.before(async () => {
    await sandbox.initDb();
    store = require(S('services', 'manga', 'store'));
    convert = require(S('services', 'manga', 'convert'));
    importService = require(S('services', 'importService'));
    ({ Item } = require(S('models', 'associations')));
});
test.after(() => sandbox.cleanup());

test('folder → manga: natural page order, cover thumb, item fields, originals kept', async () => {
    const dir = path.join(src, 'book');
    for (const [n, r] of [['10.jpg', 100], ['2.jpg', 20], ['1.jpg', 10]]) await page(dir, n, r);
    const [item] = await convert.fromFolder(dir, { tags: ['Doujin'] });
    assert.equal(item.mimeType, store.MANGA_MIME);
    assert.equal(item.pageCount, 3);
    assert.equal(item.title, 'book');
    const book = store.bookOf(item.id);
    assert.equal(book.chapters.length, 1);
    assert.deepEqual(book.chapters[0].pages.map(p => p.file), ['c1/0001.jpg', 'c1/0002.jpg', 'c1/0003.jpg']);
    // 1.jpg (r=10) came first
    const { data } = await sharp(store.resolvePage(item.id, 'c1/0001.jpg')).raw().toBuffer({ resolveWithObject: true });
    assert.ok(data[0] < 30);
    assert.ok(fs.existsSync(path.join(importService.itemsPath(), item.id, 'thumb.jpg')));
    assert.ok(fs.existsSync(path.join(dir, '1.jpg')), 'originals stay');
});

test('subfolders become chapters; "each" makes one manga per subfolder', async () => {
    const dir = path.join(src, 'series');
    await page(path.join(dir, 'Ch 2'), 'a.jpg', 50);
    await page(path.join(dir, 'Ch 10'), 'a.jpg', 60);
    await page(path.join(dir, 'Ch 1'), 'a.jpg', 70);
    const plan = convert.planFolder(dir);
    assert.deepEqual(plan[0].chapters.map(c => c.title), ['Ch 1', 'Ch 2', 'Ch 10']);
    assert.equal(convert.planFolder(dir, 'each').length, 3);
});

test('remove → restore puts pages back where they were; purge empties removed/', async () => {
    const dir = path.join(src, 'edit');
    for (let i = 1; i <= 5; i++) await page(dir, `${i}.jpg`, i * 40);
    const [item] = await convert.fromFolder(dir);
    let book = await store.removePages(item.id, ['c1/0002.jpg', 'c1/0004.jpg']);
    assert.deepEqual(pages(item.id), ['c1/0001.jpg', 'c1/0003.jpg', 'c1/0005.jpg']);
    assert.equal(book.removed.length, 2);
    assert.equal((await Item.findByPk(item.id)).pageCount, 3);

    book = await store.restorePages(item.id, book.removed.map(r => r.stored));
    assert.deepEqual(pages(item.id), ['c1/0001.jpg', 'c1/0002.jpg', 'c1/0003.jpg', 'c1/0004.jpg', 'c1/0005.jpg']);
    assert.equal(book.removed.length, 0);

    await store.removePages(item.id, ['c1/0001.jpg']);
    assert.notEqual(store.bookOf(item.id).cover, 'c1/0001.jpg', 'cover moves off a removed page');
    await store.purgeRemoved(item.id);
    assert.equal(fs.existsSync(path.join(importService.itemsPath(), item.id, 'removed')), false);
    assert.equal(store.bookOf(item.id).removed.length, 0);
    await assert.rejects(store.removePages(item.id, pages(item.id)), /все страницы/);
});

test('reorder, cover, add pages, page thumbnails', async () => {
    const dir = path.join(src, 'order');
    for (let i = 1; i <= 3; i++) await page(dir, `${i}.jpg`, i * 50);
    const [item] = await convert.fromFolder(dir);
    await store.reorderPages(item.id, [{ chapter: 'c1', files: ['c1/0003.jpg', 'c1/0001.jpg', 'c1/0002.jpg'] }]);
    assert.deepEqual(pages(item.id), ['c1/0003.jpg', 'c1/0001.jpg', 'c1/0002.jpg']);
    await store.setCover(item.id, 'c1/0002.jpg');
    assert.equal(store.bookOf(item.id).cover, 'c1/0002.jpg');
    const extra = await page(path.join(src, 'extra'), 'x.png', 200);
    await store.addPages(item.id, [extra], { newChapterTitle: 'Бонус' });
    const book = store.bookOf(item.id);
    assert.equal(book.chapters[1].title, 'Бонус');
    assert.equal((await Item.findByPk(item.id)).pageCount, 4);
    const thumb = await store.pageThumbFile(item.id, 'c1/0001.jpg');
    assert.ok(fs.existsSync(thumb));
});

test('CBZ in (with ComicInfo.xml and chapter folders) and out again', async () => {
    const a = await sharp({ create: { width: 30, height: 40, channels: 3, background: '#f00' } }).png().toBuffer();
    const zip = zipSync({
        'Vol 1/2.png': a, 'Vol 1/1.png': a, 'Vol 2/1.png': a,
        'ComicInfo.xml': strToU8('<ComicInfo><Title>Тест &amp; книга</Title><Tags>a, b</Tags><Writer>Artist X</Writer><Manga>YesAndRightToLeft</Manga><Web>https://example.org/g/1</Web></ComicInfo>'),
        'notes.txt': strToU8('ignored'),
    });
    const file = path.join(src, 'book.cbz');
    fs.writeFileSync(file, zip);
    const item = await convert.fromArchive(file);
    assert.equal(item.title, 'Тест & книга');
    assert.equal(item.sourceUrl, 'https://example.org/g/1');
    const book = store.bookOf(item.id);
    assert.deepEqual(book.chapters.map(c => [c.title, c.pages.length]), [['Vol 1', 2], ['Vol 2', 1]]);
    assert.equal(book.reading.direction, 'rtl');
    const { withTagNames } = require(S('services', 'itemTags'));
    const tags = (await withTagNames([{ id: item.id }]))[0].tags.sort();
    assert.deepEqual(tags, ['a', 'artist x', 'b']);

    const out = path.join(src, 'out.cbz');
    const res = await convert.exportCbz(item.id, out);
    assert.equal(res.pages, 3);
    const back = unzipSync(fs.readFileSync(out));
    assert.ok(back['ComicInfo.xml']);
    assert.ok(Object.keys(back).some(n => n.startsWith('001 - Vol 1/')));
});

test('library images → manga in the given order; split back into images', async () => {
    const ids = [];
    for (let i = 1; i <= 3; i++) {
        const p = await page(path.join(src, 'imgs'), `p${i}.jpg`, i * 70, 200 + i);
        ids.push((await importService.importFile({ filePath: p, tags: [`t${i}`] })).item.id);
    }
    const { item } = await convert.fromItems([ids[2], ids[0], ids[1]], { title: 'Из картинок', trashOriginals: true });
    assert.equal(item.pageCount, 3);
    assert.equal(store.bookOf(item.id).chapters[0].pages[0].h, 203, 'first page is the third image');
    assert.equal(await Item.count({ where: { id: ids } }), 0, 'originals went to the trash');
    const res = await convert.splitToImages(item.id);
    assert.equal(res.results.length, 3);
});
