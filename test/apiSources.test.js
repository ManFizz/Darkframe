const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const sharp = require('sharp');
const { execFileSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const S = sandbox.serverPath;
let importService, sourceMatch, apiServer, apiTokens, Item;
let server, base;
const srcDir = path.join(sandbox.dir, 'src');

async function makeImage(name, rgb) {
    const p = path.join(srcDir, name);
    await sharp({ create: { width: 40, height: 30, channels: 3, background: rgb } }).png().toFile(p);
    return p;
}

// A request to the API server under test (its own port, never the app's 45678).
function call(method, url, { body, token } = {}) {
    return new Promise((resolve, reject) => {
        const data = body === undefined ? null : JSON.stringify(body);
        const req = http.request(base + url, {
            method,
            headers: {
                ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        }, (res) => {
            let text = '';
            res.on('data', c => text += c);
            res.on('end', () => resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null }));
        });
        req.on('error', reject);
        req.end(data);
    });
}

test.before(async () => {
    await sandbox.initDb();
    fs.mkdirSync(srcDir, { recursive: true });
    importService = require(S('services', 'importService'));
    sourceMatch   = require(S('services', 'sourceMatch'));
    apiServer     = require(S('apiServer'));
    apiTokens     = require(S('apiTokens'));
    ({ Item } = require(S('models', 'associations')));
    server = http.createServer(apiServer.handleRequest);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
    await new Promise(r => server.close(r));
    await sandbox.cleanup();
});

test('createdAt from a client: seconds, milliseconds, ISO; junk is ignored', () => {
    const p = apiServer.parseCreatedAt;
    assert.equal(p(1_600_000_000), 1_600_000_000);
    assert.equal(p('1600000000'), 1_600_000_000);
    assert.equal(p(1_600_000_000.7), 1_600_000_000);
    assert.equal(p(1_600_000_000_123), 1_600_000_000);
    assert.equal(p('2020-09-13T12:26:40Z'), 1_600_000_000);
    for (const bad of [undefined, null, '', 'yesterday', -5, 0, NaN]) assert.equal(p(bad), undefined, String(bad));
});

test('importFile keeps the given createdAt instead of the file date', async () => {
    const f = await makeImage('dated.png', { r: 10, g: 20, b: 30 });
    const res = await importService.importFile({ quiet: true, filePath: f, sourceUrl: 'x', overrides: { title: 't', createdAt: 1_234_567_890 } });
    assert.equal(res.item.createdAt, 1_234_567_890);
    const plain = await importService.importFile({ quiet: true, filePath: await makeImage('undated.png', { r: 30, g: 20, b: 10 }) });
    assert.ok(plain.item.createdAt > 1_600_000_000, 'without an override: the file date');
});

test('reddit post ids are read from every spelling of a post link', () => {
    const id = sourceMatch.redditPostId;
    for (const u of [
        'https://www.reddit.com/r/pics/comments/1abc2d/some_title/',
        'https://old.reddit.com/r/pics/comments/1abc2d/some_title',
        'http://reddit.com/r/pics/comments/1ABC2D/',
        'https://new.reddit.com/comments/1abc2d',
        'https://www.reddit.com/user/someone/comments/1abc2d/x/',
        'https://redd.it/1abc2d',
    ]) assert.equal(id(u), '1abc2d', u);
    for (const u of ['https://www.reddit.com/r/pics/', 'https://example.com/comments/1abc2d/', 'not a url', '', null]) {
        assert.equal(id(u), null, String(u));
    }
});

test('findPresentSources: reddit by post id, other links up to scheme / trailing slash', async () => {
    await Item.unscoped().bulkCreate([
        { id: 'r1', fileName: 'a', title: 'a', sourceUrl: 'https://www.reddit.com/r/pics/comments/aaa111/title/', importedAt: 1, createdAt: 1 },
        { id: 'r2', fileName: 'b', title: 'b', sourceUrl: 'https://www.reddit.com/r/pics/comments/bbb222', importedAt: 1, createdAt: 1, deletedAt: 5 },
        { id: 'r3', fileName: 'c', title: 'c', sourceUrl: 'https://www.reddit.com/r/pics/comments/ccc3334/x/', importedAt: 1, createdAt: 1 },
        { id: 'w1', fileName: 'd', title: 'd', sourceUrl: 'https://example.com/post/7', importedAt: 1, createdAt: 1 },
    ]);
    const asked = [
        'https://old.reddit.com/r/pics/comments/aaa111/',      // other host, no slug
        'https://www.reddit.com/comments/bbb222/',              // trashed item still counts
        'https://www.reddit.com/r/pics/comments/ccc333/',       // a prefix of ccc3334 — not it
        'https://www.reddit.com/r/pics/comments/zzz999/',       // absent
        'http://example.com/post/7/',                           // scheme + slash differ
        'https://example.com/post/8',                           // absent
    ];
    const present = await sourceMatch.findPresentSources(asked);
    assert.deepEqual(present, [asked[0], asked[1], asked[4]]);
    assert.deepEqual(await sourceMatch.findPresentSources([]), []);
});

test('POST /api/has: read or import scope, validates the body', async () => {
    const importTok = apiTokens.create({ name: 'imp', scopes: ['import'] }).token;
    const readTok   = apiTokens.create({ name: 'read', scopes: ['read'] }).token;
    const rimTok    = apiTokens.create({ name: 'rim', scopes: ['rim'] }).token;
    const body = { sourceUrls: ['https://redd.it/aaa111', 'https://redd.it/nope00'] };

    assert.equal((await call('POST', '/api/has', { body })).status, 401);
    assert.equal((await call('POST', '/api/has', { body, token: rimTok })).status, 401);
    for (const token of [importTok, readTok]) {
        const r = await call('POST', '/api/has', { body, token });
        assert.equal(r.status, 200);
        assert.deepEqual(r.json.present, ['https://redd.it/aaa111']);
    }
    assert.equal((await call('POST', '/api/has', { body: { sourceUrls: 'x' }, token: readTok })).status, 400);
});

test('POST /api/addBase64 stores createdAt and the source link', async () => {
    const token = apiTokens.create({ name: 'imp2', scopes: ['import'] }).token;
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 99, b: 7 } } }).png().toBuffer();
    const r = await call('POST', '/api/addBase64', { token, body: {
        base64: png.toString('base64'), mimeType: 'image/png', title: 'Post (1/2)',
        sourceUrl: 'https://www.reddit.com/r/x/comments/ddd444/post/', createdAt: 1_500_000_000,
    } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const row = await Item.findByPk(r.json.id, { raw: true });
    assert.equal(row.createdAt, 1_500_000_000);
    assert.equal(row.title, 'Post (1/2)');
    assert.equal(row.sourceUrl, 'https://www.reddit.com/r/x/comments/ddd444/post/');
    const has = await call('POST', '/api/has', { token, body: { sourceUrls: ['https://old.reddit.com/comments/ddd444'] } });
    assert.deepEqual(has.json.present, ['https://old.reddit.com/comments/ddd444']);
});

test('muxAudioVideo joins a silent video and a separate sound track', async () => {
    const ffOps = require(S('services', 'ffmpegOps'));
    const v = path.join(srcDir, 'video.mp4');
    const a = path.join(srcDir, 'audio.mp4');
    const out = path.join(srcDir, 'joined.mp4');
    execFileSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=15:duration=2',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', '-y', v]);
    execFileSync(ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
        '-c:a', 'aac', '-vn', '-y', a]);
    await ffOps.muxAudioVideo(v, a, out);
    const info = execFileSync(require('ffprobe-static').path, ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', out]).toString();
    assert.deepEqual(info.trim().split(/\s+/).sort(), ['audio', 'video']);
    assert.ok(!fs.existsSync(`${out}.part.mp4`));
    await assert.rejects(ffOps.muxAudioVideo(v, path.join(srcDir, 'missing.mp4'), path.join(srcDir, 'bad.mp4')));
    assert.ok(!fs.existsSync(path.join(srcDir, 'bad.mp4.part.mp4')));
});

test('redgifs clip ids are read from watch / embed / poster links, any case', () => {
    const id = sourceMatch.redgifsId;
    for (const u of [
        'https://www.redgifs.com/watch/QuietGreenOtter',
        'https://redgifs.com/watch/quietgreenotter/',
        'https://www.redgifs.com/watch/quietgreenotter?a=1#x',
        'https://www.redgifs.com/ifr/quietgreenotter',
        'https://i.redgifs.com/i/quietgreenotter.jpg',
    ]) assert.equal(id(u), 'quietgreenotter', u);
    for (const u of ['https://www.redgifs.com/users/someone', 'https://example.com/watch/quietgreenotter', 'x']) {
        assert.equal(id(u), null, u);
    }
});

test('findPresentSources matches redgifs links by clip id, not by a longer id containing it', async () => {
    await Item.unscoped().bulkCreate([
        { id: 'g1', fileName: 'g', title: 'g', sourceUrl: 'https://www.redgifs.com/watch/QuietGreenOtter', importedAt: 1, createdAt: 1 },
        { id: 'g2', fileName: 'h', title: 'h', sourceUrl: 'https://www.redgifs.com/watch/loudgreenottersister', importedAt: 1, createdAt: 1 },
    ]);
    const asked = [
        'https://redgifs.com/watch/quietgreenotter/',
        'https://www.redgifs.com/watch/loudgreenotter',
        'https://www.redgifs.com/watch/nothere',
    ];
    assert.deepEqual(await sourceMatch.findPresentSources(asked), [asked[0]]);
});

test('tags may carry a site category; it fills an empty one and never overrides the user', async () => {
    const { Tag } = require(S('models', 'associations'));
    assert.deepEqual(importService.normalizeTags(['a', ' ', { name: 'b', type: 1 }, { name: 'c', type: 77 }, null, { name: '' }]),
        [{ name: 'a', type: null }, { name: 'b', type: 1 }, { name: 'c', type: null }]);

    await Tag.create({ name: 'pre_untyped', remoteType: 0 });
    await Tag.create({ name: 'pre_user', remoteType: 0, userType: 100 });
    await Tag.create({ name: 'pre_site', remoteType: 0, type: 3 });
    const f = await makeImage('typed.png', { r: 5, g: 50, b: 150 });
    const res = await importService.importFile({ quiet: true, filePath: f, tags: [
        { name: 'new_creator', type: 1 }, 'plain', { name: 'pre_untyped', type: 1 }, { name: 'pre_user', type: 1 }, { name: 'pre_site', type: 1 },
    ] });
    assert.equal(res.skipped, false);
    const by = Object.fromEntries((await Tag.findAll({ raw: true })).map(t => [t.name, t]));
    assert.equal(by.new_creator.type, 1);
    assert.equal(by.plain.type, null);
    assert.equal(by.pre_untyped.type, 1);
    assert.equal(by.pre_user.userType, 100, 'the user\'s choice stays');
    assert.equal(by.pre_site.type, 3, 'an existing category stays');
});

test('POST /api/addStream takes tags with categories, createdAt and the source link from meta', async () => {
    const { Tag } = require(S('models', 'associations'));
    const token = apiTokens.create({ name: 'imp3', scopes: ['import'] }).token;
    const png = await sharp({ create: { width: 9, height: 9, channels: 3, background: { r: 200, g: 9, b: 70 } } }).png().toBuffer();
    const meta = { title: 'clip', mimeType: 'image/png', createdAt: 1_650_000_000,
        sourceUrl: 'https://www.redgifs.com/watch/someclipid', tags: ['outdoor', { name: 'stream_creator', type: 1 }] };
    const r = await new Promise((resolve, reject) => {
        const req = http.request(`${base}/api/addStream?meta=${encodeURIComponent(JSON.stringify(meta))}`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png', 'Content-Length': png.length },
        }, (res) => { let t = ''; res.on('data', c => t += c); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(t) })); });
        req.on('error', reject);
        req.end(png);
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const row = await Item.findByPk(r.json.id, { include: ['tags'] });
    assert.equal(row.createdAt, 1_650_000_000);
    assert.equal(row.sourceUrl, meta.sourceUrl);
    assert.deepEqual(row.tags.map(t => t.name).sort(), ['outdoor', 'stream_creator']);
    assert.equal((await Tag.findOne({ where: { name: 'stream_creator' } })).type, 1);
});

test('GET /userscripts/darkframe.user.js serves a fresh build without a token', async () => {
    const text = await new Promise((resolve, reject) => {
        http.get(`${base}/userscripts/darkframe.user.js`, (res) => {
            assert.equal(res.statusCode, 200);
            assert.match(res.headers['content-type'], /javascript/);
            let t = ''; res.setEncoding('utf8'); res.on('data', c => t += c); res.on('end', () => resolve(t));
        }).on('error', reject);
    });
    assert.ok(text.startsWith('// ==UserScript=='));
    assert.match(text, /@match\s+https:\/\/www\.reddit\.com\/\*/);
});
