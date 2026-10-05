const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const registry = require('./registry');
const protocols = require('./protocols');
const devices = require('./devices');
const policy = require('./policy');

/**
 * The library over the home network: the same interface the desktop window shows,
 * served to a phone / tablet / another computer's browser.
 *
 *   GET  /pair?c=<code>    pairing link from the QR code → device cookie
 *   GET  /, /<file>        the app (dist/), with /boot.js describing this device
 *   POST /rpc              { channel, args } → the same handler as ipcRenderer.invoke
 *   POST /send             { channel, args } → ipcRenderer.send
 *   GET  /events           server-sent events: everything the desktop gets pushed
 *   GET  /x/<scheme>/…     library://, mangaimg://, mediacache:// files (with Range)
 *   POST /upload           a file from the device → the library
 *
 * Everything but /pair needs a paired device (cookie, or a Bearer token).
 */
const DIST = path.join(__dirname, '..', '..', 'dist');
const COOKIE = 'df_remote';
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

let server = null;
let state = { running: false, port: null, error: null };
const clients = new Set();   // SSE: { res, device }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cookies(req) {
    const out = {};
    String(req.headers.cookie || '').split(';').forEach(p => {
        const i = p.indexOf('=');
        if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    });
    return out;
}
function deviceOf(req) {
    const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)/i)?.[1];
    return devices.check(bearer || cookies(req)[COOKIE]);
}
function send(res, status, body, headers = {}) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    res.writeHead(status, { 'Content-Length': buf.length, 'Cache-Control': 'no-store', ...headers });
    res.end(buf);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });

function readBody(req, limit = 32 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('Слишком большой запрос')); req.destroy(); } else chunks.push(c); });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

const baseOf = (req) => `http://${req.headers.host || 'localhost'}`;

// The page's own event-sender stand-in: progress messages go back to this device.
function fakeEvent(device) {
    return {
        remote: true,
        device,
        sender: {
            id: -1,
            isDestroyed: () => false,
            send: (channel, payload) => emit(channel, payload, device.id),
            reload: () => emit('remote:reload', {}, device.id),
        },
    };
}

// ─── Events (server-sent) ─────────────────────────────────────────────────────
function emit(channel, payload, deviceId = null) {
    if (!clients.size) return;
    const byBase = new Map();
    for (const c of clients) {
        if (deviceId && c.device.id !== deviceId) continue;
        if (!byBase.has(c.base)) {
            try { byBase.set(c.base, JSON.stringify({ channel, payload: protocols.rewrite(payload, c.base) })); } catch { return; }
        }
        c.res.write(`data: ${byBase.get(c.base)}\n\n`);
    }
}

function events(req, res, device) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const client = { res, device, base: baseOf(req) };
    clients.add(client);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(client); });
}

// ─── The app ──────────────────────────────────────────────────────────────────
function serveFile(res, rel) {
    const file = path.resolve(DIST, rel);
    if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    // Bundles are rebuilt under the same names: always revalidate.
    send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    return true;
}

function indexHtml() {
    let html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
    // boot.js (this device + the config) runs before the bundle; the manifest makes
    // it installable as an app on the phone's home screen.
    html = html.replace('<head lang="en" data-bs-theme="dark">', '<head lang="en" data-bs-theme="dark"><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#14111c"><meta name="apple-mobile-web-app-capable" content="yes"><link rel="apple-touch-icon" href="/x/app/icon.png">');
    html = html.replace(/<script/, '<script src="/boot.js"></script><script');
    html = html.replace('<title>Gallery</title>', '<title>Darkframe</title>');
    return html;
}

async function bootJs(device) {
    const ev = fakeEvent(device);
    const config = await registry.invoke('config:get', ev, []).catch(() => ({ settings: {}, private: {} }));
    const boot = {
        device: { id: device.id, name: device.name, access: device.access },
        config,
        sys: { homedir: '', platform: 'web', electron: null },
        sep: path.sep,
    };
    return `window.__DF_WEB__ = ${JSON.stringify(boot).replace(/</g, '\\u003c')};`;
}

const manifest = () => JSON.stringify({
    name: 'Darkframe', short_name: 'Darkframe', start_url: '/', display: 'standalone',
    background_color: '#14111c', theme_color: '#14111c',
    icons: [{ src: '/x/app/icon.png', sizes: '256x256', type: 'image/png' }],
});

function pairPage(message, ok = false) {
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Darkframe</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#14111c;color:#e9e6f2;font:16px/1.5 system-ui,sans-serif}
.box{max-width:420px;padding:28px;margin:16px;border-radius:18px;background:#1d1828;border:1px solid #322a44;text-align:center}
h1{font-size:22px;margin:0 0 10px}p{color:#b7b0c8;margin:8px 0}a{color:#b48cff}
</style></head><body><div class="box"><h1>Darkframe</h1>${message}${ok ? '<p><a href="/">Открыть библиотеку</a></p>' : ''}</div></body></html>`;
}
const NOT_PAIRED = '<p>Это устройство не подключено.</p><p>На компьютере откройте <b>Панель → Доступ → Телефон и другие устройства</b> и отсканируйте QR-код камерой телефона.</p>';

// ─── Protocol files ───────────────────────────────────────────────────────────
async function protocolFile(req, res, scheme, rest) {
    if (scheme === 'app') {   // the app icon for the home screen
        const icon = path.join(__dirname, '..', '..', 'assets', 'icon.png');
        return fs.existsSync(icon) ? send(res, 200, fs.readFileSync(icon), { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' }) : send(res, 404, 'no icon');
    }
    const fn = protocols.get(scheme);
    if (!fn || scheme === 'fsthumb') return send(res, 404, 'not found');
    const request = { url: `${scheme}://${rest}`, method: 'GET', headers: new Headers(req.headers.range ? { range: req.headers.range } : {}) };
    const r = await fn(request);
    const headers = {};
    r.headers.forEach((v, k) => { headers[k] = v; });
    if (!headers['cache-control']) headers['cache-control'] = 'private, max-age=3600';
    res.writeHead(r.status, headers);
    if (!r.body || req.method === 'HEAD') return res.end();
    Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res);
}

// ─── Upload: a file from the device into the library ──────────────────────────
async function upload(req, res, url, device) {
    const name = path.basename(String(url.searchParams.get('name') || 'upload')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 150) || 'upload';
    const collectionId = url.searchParams.get('collectionId') || null;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkframe-upload-'));
    const file = path.join(dir, name);
    try {
        await new Promise((resolve, reject) => {
            const out = fs.createWriteStream(file);
            req.pipe(out);
            out.on('finish', resolve);
            out.on('error', reject);
            req.on('error', reject);
        });
        let r;
        if (/\.(cbz|zip)$/i.test(name)) {
            // A comic / manga archive → a manga.
            try {
                const item = await require('../services/manga/convert').fromArchive(file, { collectionId });
                r = { results: [item], skipped: [], errors: [] };
            } catch (e) {
                r = { results: [], skipped: [], errors: [{ error: e.message }] };
            }
        } else {
            const { importFiles } = require('../services/importService');
            r = await importFiles({ filePaths: [file], collectionId });
        }
        json(res, 200, protocols.rewrite(r, baseOf(req)));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    void device;
}

// ─── Router ───────────────────────────────────────────────────────────────────
async function route(req, res) {
    const url = new URL(req.url, 'http://local');
    const p = decodeURIComponent(url.pathname);

    if (p === '/pair') {
        const r = devices.redeem(url.searchParams.get('c'), req.headers['user-agent']);
        if (!r) return send(res, 403, pairPage('<p>Ссылка устарела или уже использована.</p><p>Покажите на компьютере новый QR-код.</p>'), { 'Content-Type': 'text/html; charset=utf-8' });
        return send(res, 302, '', {
            Location: '/',
            'Set-Cookie': `${COOKIE}=${encodeURIComponent(r.token)}; Path=/; Max-Age=${5 * 365 * 86400}; HttpOnly; SameSite=Strict`,
        });
    }
    if (p === '/favicon.ico') return send(res, 204, '');

    const device = deviceOf(req);
    if (!device) {
        if (p === '/' || p === '/index.html') return send(res, 401, pairPage(NOT_PAIRED), { 'Content-Type': 'text/html; charset=utf-8' });
        return json(res, 401, { error: 'Устройство не подключено' });
    }

    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return send(res, 200, indexHtml(), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    if (p === '/boot.js') return send(res, 200, await bootJs(device), { 'Content-Type': 'text/javascript; charset=utf-8' });
    if (p === '/manifest.webmanifest') return send(res, 200, manifest(), { 'Content-Type': MIME['.webmanifest'] });
    if (p === '/events') return events(req, res, device);

    const x = p.match(/^\/x\/([a-z]+)\/(.*)$/);
    if (x && (req.method === 'GET' || req.method === 'HEAD')) {
        const rest = req.url.slice(req.url.indexOf(`/x/${x[1]}/`) + x[1].length + 4);
        return protocolFile(req, res, x[1], rest);
    }

    // Calls: same-origin only (the custom header can't be sent cross-site without
    // a CORS preflight, which this server never answers).
    if (req.method === 'POST' && (p === '/rpc' || p === '/send' || p === '/upload')) {
        if (req.headers['x-darkframe'] !== '1') return json(res, 403, { error: 'forbidden' });
        if (p === '/upload') {
            if (device.access !== 'full') return json(res, 403, { error: 'У этого устройства доступ только для просмотра' });
            return upload(req, res, url, device);
        }
        let body;
        try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); } catch { return json(res, 400, { error: 'bad request' }); }
        const channel = String(body.channel || '');
        const verdict = policy.allowed(channel, device.access);
        if (!verdict.ok) return json(res, 403, { error: verdict.reason });
        if (p === '/send') { registry.send(channel, fakeEvent(device), body.args); return json(res, 200, { ok: true }); }
        try {
            const result = await registry.invoke(channel, fakeEvent(device), body.args);
            return json(res, 200, { result: protocols.rewrite(result === undefined ? null : result, baseOf(req)) });
        } catch (e) {
            return json(res, 200, { error: String(e?.message || e) });
        }
    }

    if (req.method === 'GET' && serveFile(res, p.replace(/^\/+/, ''))) return;
    send(res, 404, 'not found');
}

// ─── Start / stop ─────────────────────────────────────────────────────────────
function start(port = devices.settings().port) {
    return new Promise((resolve) => {
        stop();
        state = { running: false, port, error: null };
        server = http.createServer((req, res) => {
            route(req, res).catch(e => { try { json(res, 500, { error: String(e?.message || e) }); } catch { /* sent */ } });
        });
        server.on('error', (e) => {
            state = { running: false, port, error: e.code === 'EADDRINUSE' ? `Порт ${port} занят другой программой` : e.message };
            server = null;
            resolve(status());
        });
        server.listen(port, '0.0.0.0', () => { state = { running: true, port, error: null }; resolve(status()); });
    });
}

function stop() {
    for (const c of clients) { try { c.res.end(); } catch { /* ignore */ } }
    clients.clear();
    if (server) { try { server.close(); } catch { /* ignore */ } }
    server = null;
    state = { ...state, running: false };
}

function status() {
    const s = devices.settings();
    const addresses = devices.lanAddresses();
    return {
        ...s,
        runningPort: state.running ? state.port : null,
        running: state.running,
        error: state.error,
        urls: addresses.map(a => ({ ...a, url: `http://${a.address}:${state.port || s.port}` })),
        devices: devices.list(),
        connected: [...new Set([...clients].map(c => c.device.id))],
    };
}

module.exports = { start, stop, status, emit };
