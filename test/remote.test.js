const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');

/**
 * Phone / browser access: pairing by a one-time code, the cookie it leaves, calls
 * going to the same handlers as IPC (with app URLs rewritten to HTTP), PC-only and
 * view-only refusals, pushed events, protocol files.
 */
const S = sandbox.serverPath;
const electron = require(require.resolve('electron', { paths: [sandbox.ROOT] }));
let registry, protocols, devices, remote, base;

function request(method, url, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(base + url, { method, headers }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}
const rpc = (cookie, channel, args = [], extra = {}) => request('POST', '/rpc', {
    body: JSON.stringify({ channel, args }),
    headers: { 'Content-Type': 'application/json', 'X-Darkframe': '1', Cookie: cookie, ...extra },
}).then(r => ({ ...r, json: JSON.parse(r.body) }));

async function pair(access) {
    const { code } = devices.createCode({ access });
    const r = await request('GET', `/pair?c=${code}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A)' } });
    assert.equal(r.status, 302);
    return r.headers['set-cookie'][0].split(';')[0];
}

test.before(async () => {
    registry = require(S('remote', 'registry'));
    protocols = require(S('remote', 'protocols'));
    devices = require(S('remote', 'devices'));
    devices.setFile(path.join(sandbox.dir, 'remote-access.json'));
    registry.install();
    electron.ipcMain.handle('test:echo', (event, x) => ({ x, remote: !!event.remote, thumb: 'library://thumb/abc?v=1' }));
    electron.ipcMain.handle('library:updateItem', () => ({ ok: true }));
    electron.ipcMain.handle('library:getItems', () => [{ id: 1 }]);
    electron.ipcMain.handle('fs:list', () => []);
    electron.ipcMain.handle('test:progress', (event) => { event.sender.send('test:tick', { n: 1 }); return true; });
    protocols.install(electron.protocol);
    electron.protocol.handle('library', async (req) => new Response(`file for ${new URL(req.url).pathname}`, { status: 200, headers: { 'Content-Type': 'text/plain' } }));
    remote = require(S('remote', 'server'));
    const st = await remote.start(0 + 47911);
    assert.ok(st.running, st.error || '');
    base = 'http://127.0.0.1:47911';
});
test.after(() => { remote.stop(); return sandbox.cleanup(); });

test('without pairing nothing opens; a used code is gone', async () => {
    const page = await request('GET', '/');
    assert.equal(page.status, 401);
    assert.match(page.body, /не подключено/);
    assert.equal((await rpc('', 'test:echo', [1])).status, 401);
    const { code } = devices.createCode({});
    assert.equal((await request('GET', `/pair?c=${code}`)).status, 302);
    assert.equal((await request('GET', `/pair?c=${code}`)).status, 403);
});

test('a paired device calls the same handlers; app URLs become HTTP ones', async () => {
    const cookie = await pair('full');
    const r = await rpc(cookie, 'test:echo', [42]);
    assert.equal(r.json.result.x, 42);
    assert.equal(r.json.result.remote, true);
    assert.equal(r.json.result.thumb, `${base}/x/library/thumb/abc?v=1`);
    const d = devices.list().find(x => x.name === 'Pixel 8');
    assert.ok(d, 'device named after the phone');

    // without the custom header (a cross-site form / fetch) → refused
    const forged = await rpc(cookie, 'test:echo', [1], { 'X-Darkframe': '' });
    assert.equal(forged.status, 403);

    // PC-only things stay on the PC
    const fs = await rpc(cookie, 'fs:list', []);
    assert.equal(fs.status, 403);

    // files of the app protocols, under /x/
    const f = await request('GET', '/x/library/thumb/abc?v=1', { headers: { Cookie: cookie } });
    assert.equal(f.status, 200);
    assert.equal(f.body, 'file for /abc');

    // the app itself, with boot.js in front of the bundle
    const page = await request('GET', '/', { headers: { Cookie: cookie } });
    assert.equal(page.status, 200);
    assert.match(page.body, /<script src="\/boot\.js"><\/script>/);
});

test('view-only devices read but don\'t change', async () => {
    const cookie = await pair('view');
    assert.deepEqual((await rpc(cookie, 'library:getItems', [{}])).json.result, [{ id: 1 }]);
    const w = await rpc(cookie, 'library:updateItem', [{ id: 1 }]);
    assert.equal(w.status, 403);
    assert.match(w.json.error, /просмотра/);
});

test('events: broadcasts and per-device progress arrive over /events; revoking cuts the device off', async () => {
    const cookie = await pair('full');
    const got = [];
    const es = await new Promise((resolve) => {
        const req = http.get(base + '/events', { headers: { Cookie: cookie } }, (res) => {
            res.setEncoding('utf8');
            res.on('data', (chunk) => chunk.split('\n').filter(l => l.startsWith('data: ')).forEach(l => got.push(JSON.parse(l.slice(6)))));
            resolve(req);
        });
    });
    await new Promise(r => setTimeout(r, 50));
    remote.emit('library:changed', { added: 2, cover: 'library://item/x' });
    await rpc(cookie, 'test:progress');
    await new Promise(r => setTimeout(r, 100));
    es.destroy();
    assert.deepEqual(got.map(g => g.channel), ['library:changed', 'test:tick']);
    assert.equal(got[0].payload.cover, `${base}/x/library/item/x`);

    const dev = devices.list().at(-1);
    devices.revoke(dev.id);
    assert.equal((await rpc(cookie, 'test:echo', [1])).status, 401);
});
