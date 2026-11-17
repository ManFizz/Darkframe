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
 * Everything but /pair and the home-screen app files (manifest, icons, sw.js,
 * offline.html) needs a paired device (cookie, or a Bearer token).
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
    html = html.replace('<head lang="en" data-bs-theme="dark">', `<head lang="en" data-bs-theme="dark">${APP_HEAD}`);
    // Edge to edge on phones with a notch (the layout pads by env(safe-area-inset-*)).
    html = html.replace(/<meta name="viewport" content="([^"]*)">/, (m, c) => `<meta name="viewport" content="${c},viewport-fit=cover">`);
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

// What makes the page an app on the phone: the manifest, icons, iOS tags, and a
// service worker that shows a page of its own when the computer can't be reached.
// None of it is private, so it's served before the device check (browsers fetch
// the manifest and icons without cookies).
const APP_HEAD = [
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<meta name="theme-color" content="#14111c">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '<meta name="apple-mobile-web-app-title" content="Darkframe">',
    '<link rel="apple-touch-icon" href="/icon-180.png">',
    '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">',
].join('');

const manifest = () => JSON.stringify({
    id: '/', name: 'Darkframe', short_name: 'Darkframe', description: 'Библиотека картинок, видео и манги с компьютера',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'any', lang: 'ru',
    background_color: '#14111c', theme_color: '#14111c',
    icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
});

// The maskable icon: the background fills the square, the picture stays inside
// the middle 80% that every launcher shape keeps.
const MASKABLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b784ff"/><stop offset="1" stop-color="#6d3ad6"/></linearGradient></defs>
<rect width="256" height="256" fill="url(#bg)"/>
<g transform="translate(128 128) scale(0.72) translate(-128 -128)">
<rect x="52" y="60" width="152" height="136" rx="18" fill="#1b1430"/><circle cx="160" cy="98" r="15" fill="#ffd66b"/>
<path d="M64 184 L108 128 L140 164 L160 144 L192 184 Z" fill="#c9a6ff"/></g></svg>`;

const icons = new Map();
async function iconPng(name) {
    const m = name.match(/^icon-(maskable-)?(\d+)\.png$/);
    const size = m && Number(m[2]);
    if (!size || ![180, 192, 512].includes(size)) return null;
    if (!icons.has(name)) {
        const sharp = require('sharp');
        const svg = m[1] ? Buffer.from(MASKABLE_SVG) : fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'icon.svg'));
        // iOS rounds the corners itself and shows transparency as black: a full square.
        const src = size === 180 ? Buffer.from(MASKABLE_SVG.replace('scale(0.72)', 'scale(0.86)')) : svg;
        icons.set(name, await sharp(src, { density: 384 }).resize(size, size).png().toBuffer());
    }
    return icons.get(name);
}

const OFFLINE_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#14111c"><title>Darkframe</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#14111c;color:#e9e6f2;font:16px/1.5 system-ui,sans-serif}
.box{max-width:420px;padding:28px;margin:16px;border-radius:18px;background:#1d1828;border:1px solid #322a44;text-align:center}
h1{font-size:21px;margin:0 0 10px}p{color:#b7b0c8;margin:8px 0}
button{display:block;width:100%;margin-top:16px;padding:13px;border:none;border-radius:12px;background:#9b6bff;color:#fff;font:600 16px system-ui,sans-serif}
</style></head><body><div class="box"><h1>Компьютер недоступен</h1>
<p>Darkframe открывается с вашего компьютера. Проверьте, что он включён, приложение запущено, а телефон в той же сети Wi-Fi.</p>
<button onclick="location.replace('/')">Повторить</button></div>
<script>addEventListener('online',()=>location.replace('/'));setInterval(()=>fetch('/manifest.webmanifest',{cache:'no-store'}).then(r=>r.ok&&location.replace('/')).catch(()=>{}),5000);</script>
</body></html>`;

// Service worker: the "computer is off" page is built into it (no cache storage
// needed); nothing of the library is cached, everything else goes to the network.
const SW_JS = `const OFFLINE = ${JSON.stringify(OFFLINE_HTML)};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
    if (e.request.mode !== 'navigate') return;
    e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});`;

async function appFile(res, p) {
    if (p === '/manifest.webmanifest') { send(res, 200, manifest(), { 'Content-Type': MIME['.webmanifest'], 'Cache-Control': 'no-cache' }); return true; }
    if (p === '/sw.js') { send(res, 200, SW_JS, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' }); return true; }
    if (p === '/offline.html') { send(res, 200, OFFLINE_HTML, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); return true; }
    if (/^\/icon-[\w-]+\.png$/.test(p)) {
        const png = await iconPng(p.slice(1)).catch(() => null);
        if (!png) return false;
        send(res, 200, png, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=604800' });
        return true;
    }
    return false;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pairPage(message, { ok = false, head = '' } = {}) {
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Darkframe</title>${head}<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#14111c;color:#e9e6f2;font:16px/1.5 system-ui,sans-serif}
.box{max-width:420px;padding:28px;margin:16px;border-radius:18px;background:#1d1828;border:1px solid #322a44;text-align:center}
h1{font-size:22px;margin:0 0 10px}p{color:#b7b0c8;margin:8px 0}a{color:#b48cff}
.btn{display:block;width:100%;box-sizing:border-box;margin-top:14px;padding:13px;border:none;border-radius:12px;background:#9b6bff;color:#fff;font:600 16px system-ui,sans-serif;text-decoration:none}
input{width:100%;box-sizing:border-box;margin-top:10px;padding:11px 12px;border-radius:10px;border:1px solid #3a3150;background:#14111c;color:#e9e6f2;font-size:15px}
label{display:block;text-align:left;font-size:13px;color:#9a92ad;margin-top:12px}
</style></head><body><div class="box"><h1>Darkframe</h1>${message}${ok ? '<a class="btn" href="/">Открыть библиотеку</a>' : ''}</div></body></html>`;
}
const NOT_PAIRED = '<p>Это устройство не подключено.</p><p>На компьютере откройте <b>Панель управления → Устройства</b>, нажмите «Подключить устройство» и отсканируйте QR-код камерой телефона.</p>';
const html = (res, status, body) => send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8' });

// Pairing in two steps: opening the link only shows a button; the device is added
// when the button is pressed (POST). Link previews / prefetching (camera apps,
// messengers, the browser itself) open the link too — they must not use the code up.
async function pair(req, res, url) {
    if (deviceOf(req)) return html(res, 200, pairPage('<p>Это устройство уже подключено.</p>', { ok: true }));
    if (req.method === 'POST') {
        const form = new URLSearchParams((await readBody(req, 64 * 1024)).toString('utf8'));
        const r = devices.redeem(form.get('c'), req.headers['user-agent'], form.get('name'));
        if (!r) return html(res, 403, pairPage('<p>Код устарел или уже использован.</p><p>Покажите на компьютере новый QR-код.</p>'));
        res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(r.token)}; Path=/; Max-Age=${5 * 365 * 86400}; HttpOnly; SameSite=Lax`);
        return html(res, 200, pairPage(`<p>Готово — «${esc(r.device.name)}» подключено${r.device.access === 'view' ? ' (только просмотр)' : ''}.</p><p>Совет: в меню браузера «Добавить на главный экран» — будет как приложение.</p>`,
            { ok: true, head: '<meta http-equiv="refresh" content="2;url=/">' }));
    }
    const code = url.searchParams.get('c');
    const c = devices.peek(code);
    if (!c) return html(res, 403, pairPage('<p>Ссылка устарела или уже использована.</p><p>Покажите на компьютере новый QR-код.</p>'));
    return html(res, 200, pairPage(`<p>Подключить это устройство к библиотеке${c.access === 'view' ? ' (только просмотр)' : ''}?</p>
<form method="post" action="/pair"><input type="hidden" name="c" value="${esc(code)}">
<label>Название устройства<input name="name" value="${esc(c.name || devices.guessName(req.headers['user-agent']))}" maxlength="60"></label>
<button class="btn" type="submit">Подключить</button></form>`));
}

async function protocolFile(req, res, scheme, rest) {
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

async function route(req, res) {
    const url = new URL(req.url, 'http://local');
    const p = decodeURIComponent(url.pathname);

    if (p === '/pair') return pair(req, res, url);
    if (p === '/favicon.ico') return send(res, 204, '');
    if (req.method === 'GET' && await appFile(res, p)) return;

    const device = deviceOf(req);
    if (!device) {
        if (p === '/' || p === '/index.html') return send(res, 401, pairPage(NOT_PAIRED), { 'Content-Type': 'text/html; charset=utf-8' });
        return json(res, 401, { error: 'Устройство не подключено' });
    }

    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return send(res, 200, indexHtml(), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    if (p === '/boot.js') return send(res, 200, await bootJs(device), { 'Content-Type': 'text/javascript; charset=utf-8' });
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
