const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Online manga sources: parsers on small synthetic pages (the markup the parsers
 * rely on, no real content), link matching, the page cache and the download queue
 * with a fake source and a stubbed network.
 */
const S = sandbox.serverPath;
let sources, images, downloads, store, ehentai, allhentai, MangaDownload;

test.before(async () => {
    await sandbox.initDb();
    sources = require(S('services', 'manga', 'sources'));
    images = require(S('services', 'manga', 'images'));
    downloads = require(S('services', 'manga', 'downloads'));
    store = require(S('services', 'manga', 'store'));
    ehentai = require(S('services', 'manga', 'sources', 'ehentai'));
    allhentai = require(S('services', 'manga', 'sources', 'allhentai'));
    MangaDownload = require(S('models', 'MangaDownload'));
    images.setCacheDir(path.join(sandbox.dir, 'mcache'));
});
test.after(() => sandbox.cleanup());

test('gallery links of every source are recognised', () => {
    assert.deepEqual(sources.matchUrl('https://nhentai.net/g/123456/'), { source: 'nhentai', id: '123456' });
    assert.deepEqual(sources.matchUrl('https://e-hentai.org/g/111/abcdef0123/?p=2'), { source: 'ehentai', id: '111/abcdef0123' });
    assert.deepEqual(sources.matchUrl('https://exhentai.org/g/111/abcdef0123/'), { source: 'ehentai', id: '111/abcdef0123' });
    assert.deepEqual(sources.matchUrl('https://20.allhen.online/some_title/vol1/2'), { source: 'allhentai', id: 'some_title' });
    assert.equal(sources.matchUrl('https://20.allhen.online/list/genre/x'), null);
    assert.equal(sources.matchUrl('https://example.com/g/1'), null);
    // the same gallery, whatever the domain
    assert.equal(sources.keyOfUrl('https://allhentai.ru/some_title'), sources.keyOfUrl('https://20.allhen.online/some_title/vol1/1'));
});

test('e-hentai: search rows, page links in order, viewer image + retry key', () => {
    const row = (gid, tok, title, pages) =>
        `<tr><td class="gl1e"><div><a href="https://e-hentai.org/g/${gid}/${tok}/"><img src="https://ehgt.test/t/${gid}.webp" /></a></div></td>` +
        `<td class="gl2e"><div><div class="gl3e"><div class="cn ct2">Doujinshi</div><div>${pages} pages</div></div>` +
        `<a href="https://e-hentai.org/g/${gid}/${tok}/"><div class="gl4e glname"><div class="glink">${title}</div>` +
        `<div><table><tr><td><div class="gt" title="language:english">english</div><div class="gtl" title="other:full color">full color</div></td></tr></table></div></div></a></div></td></tr>`;
    const html = `<p>Found about 1,234 results.</p><table class="itg glte">${row(10, 'aa11', 'First &amp; one', 20)}${row(11, 'bb22', 'Second', 3)}</table>` +
        `<a id="dnext" href="https://e-hentai.org/?f_search=x&amp;next=11">Next</a>`;
    const r = ehentai._parse.parseSearch(html);
    assert.equal(r.items.length, 2);
    assert.deepEqual(r.items[0], {
        id: '10/aa11', title: 'First & one', cover: 'https://ehgt.test/t/10.webp', pages: 20, category: 'Doujinshi',
        language: 'english', url: 'https://e-hentai.org/g/10/aa11/', tags: ['language:english', 'other:full color'],
    });
    assert.equal(r.next, '11');
    assert.equal(r.total, 1234);

    const links = ehentai._parse.parsePageLinks(
        '<a href="https://e-hentai.org/s/abc/10-2"><a href="https://e-hentai.org/s/def/10-1"><a href="https://e-hentai.org/s/abc/10-2">');
    assert.deepEqual(links, ['https://e-hentai.org/s/abc/10-2', 'https://e-hentai.org/s/def/10-1']);

    const v = ehentai._parse.parseViewer(`<img id="img" src="https://h.test/a.jpg?x=1&amp;y=2" style="" /><a href="#" id="loadfail" onclick="return nl('42-777')">reload</a>`);
    assert.equal(v.src, 'https://h.test/a.jpg?x=1&y=2');
    assert.equal(v.nl, '42-777');
});

test('AllHentai: card, chapters in reading order, reader pages without eval', () => {
    const html = `<h1 class="cr-hero-names__main">Some &laquo;Title&raquo;</h1>
        <h3 class="cr-hero-names__alt"><span>Alt one</span><span>Alt two</span></h3>
        <img class="cr-hero-poster__img" src="https://img.test/cover.jpg">
        <div class="cr-description__content">Line<br>two</div>
        <a href="/list/genre/a">Genre A</a><a href="/list/person/b">Person B</a><a href="/list/genre/a">Genre A</a>
        <a class="chapter-link" href="/some_title/vol1/1">Read first</a>
        <table><tr class="item-row"><td><a href="/some_title/vol2/10">Vol 2 - 10 <sup>new</sup></a></td></tr>
        <tr class="item-row"><td><a href="/some_title/vol1/2">Vol 1 - 2</a></td></tr>
        <tr class="item-row"><td><a href="/some_title/vol1/1">Vol 1 - 1</a></td></tr></table>`;
    const m = allhentai._parse.parseManga(html, 'some_title', 'https://h.test');
    assert.equal(m.title, 'Some «Title»');
    assert.equal(m.altTitle, 'Alt one / Alt two');
    assert.equal(m.cover, 'https://img.test/cover.jpg');
    assert.equal(m.description, 'Line\ntwo');
    assert.deepEqual(m.tags, [{ name: 'Genre A', type: 'genre' }, { name: 'Person B', type: 'person' }]);
    assert.deepEqual(m.chapters.map(c => c.id), ['/some_title/vol1/1', '/some_title/vol1/2', '/some_title/vol2/10']);
    assert.equal(m.chapters[2].title, 'Vol 2 - 10');

    const reader = `<script>rm_h.readerInit({"id":1}, [['https://s1.test/','',"a/1.jpg?t=1",800,1200,''],['https://s1.test/','','a/2.jpg',800,1200,'x\\'y',]], false);</script>`;
    assert.deepEqual(allhentai._parse.parseReader(reader), [
        { url: 'https://s1.test/a/1.jpg?t=1', w: 800, h: 1200 },
        { url: 'https://s1.test/a/2.jpg', w: 800, h: 1200 },
    ]);
    assert.equal(allhentai._parse.parseReader('<html>no reader</html>'), null);
    // anything that isn't a plain literal is refused, not run
    assert.equal(allhentai._parse.parseLiteral('[alert(1)]'), null);
});

// ─── Cache + downloads with a fake source ──────────────────────────────────────
const colors = new Map();   // url → colour, so every page is a different image
let requests = 0;
let failFirst = new Set();
const realFetch = global.fetch;

function stubNetwork() {
    global.fetch = async (url) => {
        requests++;
        url = String(url);
        if (failFirst.has(url)) { failFirst.delete(url); return new Response('nope', { status: 503 }); }
        if (!colors.has(url)) colors.set(url, colors.size * 20 + 10);
        const c = colors.get(url);
        const buf = await sharp({ create: { width: 60, height: 90, channels: 3, background: { r: c % 255, g: (c * 3) % 255, b: 30 } } }).png().toBuffer();
        return new Response(buf, { status: 200, headers: { 'content-type': 'image/png' } });
    };
}

const fake = {
    id: 'fake',
    name: 'Fake',
    tagTypes: { artist: 1 },
    urlOf: (id) => `https://fake.test/g/${id}`,
    matchUrl: (u) => String(u).match(/fake\.test\/g\/(\w+)/)?.[1] || null,
    async gallery(id) {
        return {
            title: `Gallery ${id}`, url: `https://fake.test/g/${id}`, cover: `https://fake.test/${id}/cover.png`, language: 'english',
            tags: [{ name: 'Artist One', type: 'artist' }, { name: 'plain', type: 'tag' }],
            chapters: [
                { id: 'c1', title: 'One', pages: [1, 2, 3].map(n => ({ url: `https://fake.test/${id}/1/${n}.png` })) },
                { id: 'c2', title: 'Two', pages: null },
            ],
        };
    },
    async chapterPages(id, chapterId) {
        return [1, 2].map(n => ({ url: `https://fake.test/${id}/${chapterId}/${n}.png` }));
    },
};

async function finished(jobId, ms = 20000) {
    const t = Date.now();
    for (;;) {
        const row = await MangaDownload.findByPk(jobId, { raw: true });
        if (['done', 'error', 'canceled'].includes(row.status)) return row;
        if (Date.now() - t > ms) throw new Error(`job stuck in ${row.status}`);
        await new Promise(r => setTimeout(r, 50));
    }
}

test('page cache: one request per image, reused afterwards', async () => {
    const realGet = sources.get;
    sources.get = (id) => (id === 'fake' ? fake : realGet(id));
    stubNetwork();
    try {
        requests = 0;
        const [a, b] = await Promise.all([
            images.fetchImage('fake', 'https://fake.test/x/1.png'),
            images.fetchImage('fake', 'https://fake.test/x/1.png'),
        ]);
        assert.equal(a, b);
        assert.equal(requests, 1, 'parallel requests for the same page share one download');
        await images.fetchImage('fake', 'https://fake.test/x/1.png');
        assert.equal(requests, 1);
        assert.ok(a.endsWith('.png') && fs.existsSync(a));
        const pages = images.toReaderPages('fake', [{ url: 'https://fake.test/x/1.png', w: 60, h: 90 }]);
        assert.match(pages[0].url, /^mangaimg:\/\/p\/\?s=fake&u=https%3A%2F%2Ffake\.test/);
    } finally {
        sources.get = realGet;
        global.fetch = realFetch;
    }
});

test('download queue: chapters → one manga with tags; retries; a second run is a duplicate', async () => {
    const realGet = sources.get;
    sources.get = (id) => (id === 'fake' ? fake : realGet(id));
    stubNetwork();
    try {
        failFirst = new Set(['https://fake.test/g1/c2/2.png']);   // one flaky page
        const job = await downloads.enqueue({ source: 'fake', id: 'g1' });
        const again = await downloads.enqueue({ source: 'fake', id: 'g1' });
        assert.equal(again.id, job.id, 'the same gallery is not queued twice');
        const row = await finished(job.id);
        assert.equal(row.status, 'done', row.error || '');
        assert.equal(row.done, 5);
        assert.equal(row.total, 5);
        const book = store.bookOf(row.itemId);
        assert.deepEqual(book.chapters.map(c => [c.title, c.pages.length]), [['One', 3], ['Two', 2]]);
        assert.equal(book.source.site, 'fake');
        const { Item, Tag } = require(S('models', 'associations'));
        const item = await Item.findByPk(row.itemId, { include: [{ model: Tag, as: 'tags' }] });
        assert.equal(item.sourceUrl, 'https://fake.test/g/g1');
        assert.deepEqual(item.tags.map(t => t.name).sort(), ['artist one', 'plain']);
        assert.equal(item.tags.find(t => t.name === 'artist one').type, 1);

        // only some chapters
        const part = await finished((await downloads.enqueue({ source: 'fake', id: 'g2', chapters: ['c2'] })).id);
        assert.equal(part.status, 'done', part.error || '');
        assert.equal(store.bookOf(part.itemId).chapters.length, 1);

        // the same gallery once more → nothing new, points at the existing item
        const dup = await finished((await downloads.enqueue({ source: 'fake', id: 'g1' })).id);
        assert.equal(dup.status, 'done');
        assert.equal(dup.itemId, row.itemId);
    } finally {
        sources.get = realGet;
        global.fetch = realFetch;
    }
});

test('download queue: a failing gallery ends in error and can be retried', async () => {
    const realGet = sources.get;
    const broken = { ...fake, async gallery() { throw new Error('site down'); } };
    let src = broken;
    sources.get = (id) => (id === 'fake' ? src : realGet(id));
    stubNetwork();
    try {
        const job = await downloads.enqueue({ source: 'fake', id: 'g3' });
        const row = await finished(job.id);
        assert.equal(row.status, 'error');
        assert.match(row.error, /site down/);
        src = fake;
        await downloads.action(job.id, 'retry');
        const ok = await finished(job.id);
        assert.equal(ok.status, 'done', ok.error || '');
        await downloads.clearFinished();
        assert.equal((await downloads.list()).length, 0);
    } finally {
        sources.get = realGet;
        global.fetch = realFetch;
    }
});

test('download queue: pause stops after the current pages, resume finishes; cancel ends the job', async () => {
    const realGet = sources.get;
    sources.get = (id) => (id === 'fake' ? fake : realGet(id));
    stubNetwork();
    const fast = global.fetch;
    global.fetch = async (url) => { await new Promise(r => setTimeout(r, 60)); return fast(url); };
    try {
        const job = await downloads.enqueue({ source: 'fake', id: 'p1' });
        // wait until it runs, then pause
        for (let i = 0; i < 100; i++) {
            const row = await MangaDownload.findByPk(job.id, { raw: true });
            if (row.status === 'running' && row.total) break;
            await new Promise(r => setTimeout(r, 10));
        }
        await downloads.action(job.id, 'pause');
        await new Promise(r => setTimeout(r, 400));
        let row = await MangaDownload.findByPk(job.id, { raw: true });
        assert.equal(row.status, 'paused');
        assert.equal(row.itemId, null);
        await downloads.action(job.id, 'resume');
        row = await finished(job.id);
        assert.equal(row.status, 'done', row.error || '');
        assert.equal(store.bookOf(row.itemId).chapters.reduce((n, c) => n + c.pages.length, 0), 5);

        const job2 = await downloads.enqueue({ source: 'fake', id: 'p2' });
        await downloads.action(job2.id, 'cancel');
        const row2 = await finished(job2.id);
        assert.equal(row2.status, 'canceled');
        assert.equal(row2.itemId, null);
    } finally {
        sources.get = realGet;
        global.fetch = realFetch;
    }
});

test('new chapters: a manga saved with some chapters gets the missing ones appended', async () => {
    const realGet = sources.get;
    sources.get = (id) => (id === 'fake' ? fake : realGet(id));
    stubNetwork();
    try {
        const first = await finished((await downloads.enqueue({ source: 'fake', id: 'u1', chapters: ['c1'] })).id);
        assert.equal(first.status, 'done', first.error || '');
        const fresh = await downloads.newChapters(first.itemId);
        assert.deepEqual(fresh.chapters.map(c => c.id), ['c2']);
        const pos = await require(S('services', 'manga', 'progress')).save(first.itemId, { chapter: 'c1', page: 1, position: 1, total: 3 });
        const job = await finished((await downloads.enqueue({ source: 'fake', id: 'u1', chapters: ['c2'], appendTo: first.itemId })).id);
        assert.equal(job.status, 'done', job.error || '');
        assert.equal(job.itemId, first.itemId);
        const book = store.bookOf(first.itemId);
        assert.deepEqual(book.chapters.map(c => [c.title, c.src, c.pages.length]), [['', 'c1', 3], ['Two', 'c2', 2]]);
        assert.ok(pos !== undefined);
        assert.deepEqual((await downloads.newChapters(first.itemId)).chapters, []);
        // nothing new → done without changes
        const again = await finished((await downloads.enqueue({ source: 'fake', id: 'u1', appendTo: first.itemId })).id);
        assert.equal(again.error, 'Новых глав нет');
        assert.equal(store.bookOf(first.itemId).chapters.length, 2);
    } finally {
        sources.get = realGet;
        global.fetch = realFetch;
    }
});

test('save page: a library manga page and an online page become images with the manga data', async () => {
    const realGet = sources.get;
    sources.get = (id) => (id === 'fake' ? fake : realGet(id));
    stubNetwork();
    try {
        const { savePage } = require(S('services', 'manga', 'savePage'));
        const { Item, Tag } = require(S('models', 'associations'));
        const job = await finished((await downloads.enqueue({ source: 'fake', id: 's1' })).id);
        const book = store.bookOf(job.itemId);
        const res = await savePage({ itemId: job.itemId, file: book.chapters[1].pages[0].file, page: 1, chapterTitle: 'Two' });
        const it = await Item.findByPk(res.item.id, { include: [{ model: Tag, as: 'tags' }] });
        assert.equal(it.title, 'Gallery s1 — стр. 1 · Two');
        assert.equal(it.sourceUrl, 'https://fake.test/g/s1');
        assert.match(it.fileName, /^Gallery s1 - p001\.png$/);
        assert.deepEqual(it.tags.map(t => t.name).sort(), ['artist one', 'plain']);
        assert.ok(it.mimeType.startsWith('image/'));
        // same page again → reported as already there
        assert.equal((await savePage({ itemId: job.itemId, file: book.chapters[1].pages[0].file, page: 1 })).skipped, true);

        const online = await savePage({
            source: 'fake', url: 'https://fake.test/o1/1/7.png', page: 7, title: 'Online one',
            tags: [{ name: 'New Artist', type: 'artist' }], sourceUrl: 'https://fake.test/g/o1',
        });
        const o = await Item.findByPk(online.item.id, { include: [{ model: Tag, as: 'tags' }] });
        assert.equal(o.title, 'Online one — стр. 7');
        assert.equal(o.sourceUrl, 'https://fake.test/g/o1');
        assert.equal(o.tags[0].name, 'new artist');
        assert.equal(o.tags[0].type, 1);
    } finally {
        sources.get = realGet;
        global.fetch = realFetch;
    }
});

test('in the library without downloading: online chapters, subscription, new chapters, download in place', async () => {
    const realGet = sources.get;
    let chapters = null;   // the site's chapter list, changed below
    const site = {
        ...fake,
        async gallery(id) {
            const g = await fake.gallery(id);
            return { ...g, chapters: chapters || g.chapters };
        },
    };
    sources.get = (id) => (id === 'fake' ? site : realGet(id));
    stubNetwork();
    const subs = require(S('services', 'manga', 'subscriptions'));
    const progress = require(S('services', 'manga', 'progress'));
    const { Item } = require(S('models', 'associations'));
    try {
        const r = await subs.addOnline({ source: 'fake', id: 'w1' });
        assert.ok(r.item && r.subscribed);
        const id = r.item.id;
        let book = store.bookOf(id);
        assert.deepEqual(book.chapters.map(c => [c.title, c.src, !!c.remote, c.pages.length]), [['One', 'c1', true, 0], ['Two', 'c2', true, 0]]);
        assert.equal(book.subscription.on, true);
        assert.ok(fs.existsSync(store.coverFile(id)), 'the site cover is the item image');
        assert.equal((await Item.findByPk(id, { raw: true })).pageCount, 0);
        // once only
        assert.equal((await subs.addOnline({ source: 'fake', id: 'w1' })).existingId, id);

        // the site publishes chapter 3 → it's added online, counted as new
        chapters = [...(await fake.gallery('w1')).chapters, { id: 'c3', title: 'Three', pages: null }];
        const res = await subs.checkOne(id, { download: false });
        assert.deepEqual(res.added.map(c => c.id), ['c3']);
        assert.deepEqual((await subs.checkOne(id, { download: false })).added, [], 'nothing new the second time');
        book = store.bookOf(id);
        assert.equal(book.subscription.unseen, 1);
        let [tile] = await progress.attach([{ id, pageCount: 0 }]);
        assert.equal(tile.mangaNew, 1);
        assert.equal(tile.mangaRemote, 3);
        assert.equal((await subs.list()).find(s => s.id === id).unseen, 1);

        // opened → seen
        subs.seen(id);
        [tile] = await progress.attach([{ id, pageCount: 0 }]);
        assert.equal(tile.mangaNew, 0);

        // download chapter 2 only: it gets its pages where it is, the others stay online
        const job = await finished((await subs.downloadRemote(id, ['c2'])).id);
        assert.equal(job.status, 'done', job.error || '');
        book = store.bookOf(id);
        assert.deepEqual(book.chapters.map(c => [c.src, !!c.remote, c.pages.length]), [['c1', true, 0], ['c2', false, 2], ['c3', true, 0]]);
        assert.ok(fs.existsSync(store.coverFile(id)), 'the site cover stays');
        assert.equal((await Item.findByPk(id, { raw: true })).pageCount, 2);
        // the rest
        const all = await finished((await subs.downloadRemote(id)).id);
        assert.equal(all.status, 'done', all.error || '');
        book = store.bookOf(id);
        assert.deepEqual(book.chapters.map(c => [c.src, !!c.remote, c.pages.length]), [['c1', false, 3], ['c2', false, 2], ['c3', false, 2]]);
        assert.equal(await subs.downloadRemote(id), null, 'nothing left online');
        [tile] = await progress.attach([{ id, pageCount: 7 }]);
        assert.equal(tile.mangaRemote, undefined);

        // unsubscribe
        await subs.setOn(id, false);
        assert.equal(store.bookOf(id).subscription, null);
        assert.equal((await subs.list()).some(s => s.id === id), false);
    } finally {
        sources.get = realGet;
        global.fetch = realFetch;
    }
});
