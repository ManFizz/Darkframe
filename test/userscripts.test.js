// The browser userscript (userscripts/): the build, and the site logic that turns a
// site's JSON into what the library gets. GM_* are stubbed; no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const path = require('path');

const US = path.join(__dirname, '..', 'userscripts');

// ─── GM stubs ───────────────────────────────────────────────────────────────
const values = new Map();
global.GM_getValue = (k, d) => (values.has(k) ? JSON.parse(values.get(k)) : d);
global.GM_setValue = (k, v) => values.set(k, JSON.stringify(v));
let routes = [];          // [[RegExp, (opts, body) => { status, body, headers? }]]
const calls = [];
global.GM_xmlhttpRequest = (o) => {
    const body = typeof o.data === 'string' ? JSON.parse(o.data) : o.data;
    calls.push({ method: o.method, url: o.url, body });
    const route = routes.find(([re]) => re.test(o.url));
    const r = route ? route[1](o, body) : { status: 404, body: {} };
    setImmediate(() => o.onload({
        status: r.status ?? 200,
        responseText: typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {}),
        response: r.response, responseHeaders: r.headers || '',
    }));
};
global.location = new URL('https://www.reddit.com/user/someone/upvoted/');

const reddit = require(path.join(US, 'sites', 'reddit.js'));
const redgifs = require(path.join(US, 'sites', 'redgifs.js'));
const runner = require(path.join(US, 'core', 'runner.js'));
const store = require(path.join(US, 'core', 'store.js'));
const { build, resolve } = require(path.join(US, 'build.js'));

test.beforeEach(() => { routes = []; calls.length = 0; });

test('the build is one valid script listing every site', () => {
    const text = build();
    new vm.Script(text);   // parses
    const meta = text.slice(0, text.indexOf('// ==/UserScript=='));
    for (const h of [...reddit.hosts, ...redgifs.hosts]) assert.ok(meta.includes(`// @match        https://${h}/*`), h);
    for (const c of ['127.0.0.1', ...reddit.connect, ...redgifs.connect]) assert.ok(meta.includes(`// @connect      ${c}`), c);
    assert.match(meta, /@version\s+1\.\d{8}\.\d{6}/);
    assert.match(meta, /@updateURL\s+http:\/\/127\.0\.0\.1:45678\/userscripts\/darkframe\.user\.js/);
    assert.equal(resolve('sites/reddit.js', '../core/http'), 'core/http.js');
    assert.equal(resolve('core/main.js', './app.js'), 'core/app.js');
});

test('reddit: which pages are handled', () => {
    assert.equal(reddit.page(new URL('https://www.reddit.com/r/pics/')), null);
    assert.deepEqual(reddit.page(new URL('https://www.reddit.com/user/Some_One/upvoted/')),
        { label: 'Upvoted', all: 'Скачать всё', user: 'Some_One', tab: 'upvoted' });
    assert.equal(reddit.page(new URL('https://old.reddit.com/u/x/saved')).tab, 'saved');
});

test('reddit: post JSON → files', async () => {
    const m = (p) => reddit.postMedia(p);
    assert.deepEqual(await m({ url: 'https://i.redd.it/a.jpg' }), { files: [{ url: 'https://i.redd.it/a.jpg' }] });
    assert.deepEqual(await m({ url: 'https://i.imgur.com/z.gifv' }), { files: [{ url: 'https://i.imgur.com/z.mp4' }] });
    assert.deepEqual(await m({ is_self: true, url: 'https://www.reddit.com/r/x/comments/1/' }), { skip: 'текстовых' });
    assert.deepEqual(await m({ url: 'https://example.com/article', post_hint: 'link' }), { skip: 'без медиа' });

    // A gallery in its own order; the original files, not the previews.
    const gallery = await m({
        is_gallery: true, gallery_data: { items: [{ media_id: 'b' }, { media_id: 'a' }] },
        media_metadata: {
            a: { status: 'valid', e: 'Image', m: 'image/png', s: { u: 'https://preview.redd.it/a.png?x=1&amp;y=2' } },
            b: { status: 'valid', e: 'AnimatedImage', m: 'image/gif', s: {} },
        },
    });
    assert.deepEqual(gallery.files.map(f => f.url), ['https://i.redd.it/b.gif', 'https://i.redd.it/a.png']);

    // A crosspost takes the original's media.
    assert.deepEqual(await m({ url: 'https://www.reddit.com/r/x/comments/2/', crosspost_parent_list: [{ url: 'https://i.redd.it/c.png' }] }),
        { files: [{ url: 'https://i.redd.it/c.png' }] });
});

test('reddit: v.redd.it — best video and sound from the DASH manifest', async () => {
    const mpd = `<?xml version="1.0"?><MPD><Period>
        <AdaptationSet contentType="video"><Representation bandwidth="100"><BaseURL>DASH_480.mp4</BaseURL></Representation>
          <Representation bandwidth="900"><BaseURL>DASH_1080.mp4</BaseURL></Representation></AdaptationSet>
        <AdaptationSet contentType="audio" mimeType="audio/mp4"><Representation bandwidth="64"><BaseURL>DASH_AUDIO_64.mp4</BaseURL></Representation>
          <Representation bandwidth="128"><BaseURL>DASH_AUDIO_128.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>`;
    routes = [[/DASHPlaylist/, () => ({ body: mpd })]];
    const rv = (extra) => ({ secure_media: { reddit_video: {
        fallback_url: 'https://v.redd.it/vid/DASH_720.mp4?source=fallback', dash_url: 'https://v.redd.it/vid/DASHPlaylist.mpd?a=1', ...extra } } });
    assert.deepEqual(await reddit.postMedia(rv({})),
        { files: [{ url: 'https://v.redd.it/vid/DASH_1080.mp4', audioUrl: ['https://v.redd.it/vid/DASH_AUDIO_128.mp4'] }] });
    assert.deepEqual(await reddit.postMedia(rv({ has_audio: false })), { files: [{ url: 'https://v.redd.it/vid/DASH_1080.mp4' }] });

    // No manifest: the fallback file and the usual sound file names to try.
    routes = [];
    const f = (await reddit.postMedia(rv({}))).files[0];
    assert.equal(f.url, 'https://v.redd.it/vid/DASH_720.mp4');
    assert.deepEqual(f.audioUrl, ['DASH_AUDIO_128.mp4', 'DASH_AUDIO_64.mp4', 'DASH_audio.mp4'].map(x => `https://v.redd.it/vid/${x}`));
});

test('reddit: a redgifs link resolves to the clip file (the same file the redgifs module saves)', async () => {
    routes = [
        [/auth\/temporary/, () => ({ body: { token: 't' } })],
        [/\/v2\/gifs\/someclip/, () => ({ body: { gif: { urls: { hd: 'https://media.redgifs.com/SomeClip.mp4', sd: 'https://media.redgifs.com/SomeClip-mobile.mp4' } } } })],
    ];
    assert.deepEqual(await reddit.postMedia({ url: 'https://www.redgifs.com/watch/SomeClip' }), { files: [{ url: 'https://media.redgifs.com/SomeClip.mp4' }] });
});

test('redgifs: pages and what the library gets for a clip', () => {
    assert.equal(redgifs.page(new URL('https://www.redgifs.com/watch/AbcDef')).current, 'abcdef');
    assert.match(redgifs.page(new URL('https://www.redgifs.com/users/someone')).list(2), /^\/users\/someone\/search\?.*page=2$/);
    assert.match(redgifs.page(new URL('https://www.redgifs.com/niches/some-niche')).list(1), /^\/niches\/some-niche\/gifs\?/);
    assert.match(redgifs.page(new URL('https://www.redgifs.com/search?query=a%20b')).list(1), /search_text=a%20b/);
    assert.equal(redgifs.page(new URL('https://www.redgifs.com/')).list, undefined);

    const settings = (creatorType, nicheTags) => ({ creatorType: { get: () => creatorType }, nicheTags: { get: () => nicheTags } });
    const gif = { id: 'abcdef', userName: 'someone', createDate: 1_650_000_000, tags: ['Tag One', ''], niches: ['n1'], description: 'First line\nsecond' };
    const f = redgifs.fields(gif, settings('1', false), 7, { i: 2, n: 3 });
    assert.deepEqual(f, {
        sourceUrl: 'https://www.redgifs.com/watch/abcdef', title: 'First line (2/3)',
        tags: ['tag one', { name: 'someone', type: 1 }],
        notes: 'First line\nsecond\nАвтор: someone (https://www.redgifs.com/users/someone)\nНиши: n1',
        createdAt: 1_650_000_000, collectionId: 7,
    });
    assert.deepEqual(redgifs.fields(gif, settings('none', true), null).tags, ['tag one', 'n1']);
    assert.deepEqual(redgifs.fields(gif, settings('', false), null).tags, ['tag one', 'someone']);
    assert.equal(redgifs.fields({ id: 'x', userName: 'u' }, settings('1', false), null).title, 'u · x');
});

test('runner: skips saved and library items, records outcomes, stops on request', async () => {
    const site = { sourceUrl: (id) => `https://s/${id}`, itemDelay: 0 };
    const st = store.siteStore('t1');
    st.markDone('done1');
    routes = [[/\/api\/has$/, (o, body) => ({ body: { ok: true, present: body.sourceUrls.filter(u => u.endsWith('/lib1')) } })]];
    const run = runner.createRun({ setStatus: () => {} });
    const saved = [];
    const entry = (id, out) => ({ id, save: async () => { saved.push(id); return out; } });
    const more = await runner.saveEntries(site, st, run, [
        entry('done1', { result: 'saved' }),
        entry('lib1', { result: 'saved' }),
        entry('new1', { result: 'saved', ids: ['new1', 'new1b'] }),
        entry('dup1', { result: 'exists' }),
        entry('half1', { result: 'partial', error: 'x' }),
        entry('bad1', { result: 'failed', error: 'boom' }),
        entry('text1', { result: 'skip', reason: 'текстовых' }),
    ]);
    assert.equal(more, true);
    assert.deepEqual(saved, ['new1', 'dup1', 'half1', 'bad1', 'text1']);
    assert.equal(run.c.already, 2);
    assert.deepEqual([run.c.saved, run.c.exists, run.c.partial, run.c.failed], [1, 1, 1, 1]);
    assert.equal(run.c.skips.get('текстовых'), 1);
    assert.equal(run.lastError, 'boom');
    for (const id of ['lib1', 'new1', 'new1b', 'dup1']) assert.ok(st.isDone(id), id);
    for (const id of ['half1', 'bad1', 'text1']) assert.ok(!st.isDone(id), id);
    assert.ok(st.seen('half1') && st.isPartial('half1'), 'partial: tried again next time');

    // Remembered across page loads (the GM storage).
    assert.ok(store.siteStore('t1').isDone('new1'));

    run.stopped = true;
    assert.equal(await runner.saveEntries(site, st, run, [entry('later', { result: 'saved' })]), false);
    assert.ok(!saved.includes('later'));
});
