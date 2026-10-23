const { app, BrowserWindow, session } = require('electron');
const { backupDatabase } = require('./server/backup');
const { setupIpcHandlers } = require('./server/ipcManager');
const { protocol } = require('electron');
const { fileResponse } = require('./server/fileResponse');
const path = require('path');
const fs = require('fs');
const { itemsPath } = require('./server/services/importService');
const { generateHeifDisplay } = require('./server/services/thumbService');
const mediaCache = require('./server/mediaCache');
const { startApiServer, stopApiServer } = require('./server/apiServer');

app.commandLine.appendSwitch('disable-quic');
app.commandLine.appendSwitch('disable-http2');

// TLS certificate errors are ignored only for these content hosts (and their
// subdomains), which need it; everything else keeps strict TLS. Matching by host
// works behind a TLS-intercepting proxy too: the SNI host is the real destination.
const TLS_BYPASS_HOSTS = ['rule34.xxx', 'realbooru.com', 'gelbooru.com'];
const isTlsBypassHost = (host) =>
    !!host && TLS_BYPASS_HOSTS.some(h => host === h || host.endsWith('.' + h));

let openDevTools = process.argv.includes('devtools');

// DARKFRAME_SMOKE=1 — start, verify the UI rendered cleanly, exit (tools/smoke.js).
// Skips the side effects that don't belong in a check run: the DB backup (it copies
// the project's data/data.db) and the local API server (its port may be taken).
const SMOKE = process.env.DARKFRAME_SMOKE === '1';
// DARKFRAME_SANDBOX=1 — a throw-away second instance (tests, previews next to the one
// in use): no API server (its port belongs to the real instance), no DB backup.
const SANDBOX = SMOKE || process.env.DARKFRAME_SANDBOX === '1';

let win;
async function createWindow() {
    win = new BrowserWindow({
        width: 700,
        height: 500,
        icon: path.join(__dirname, "assets", "icon.png"),
        webPreferences: {
            // The page has no Node / Electron access of its own: everything goes
            // through the preload bridge (window.darkframe) and IPC. Remote content
            // (booru posts, tag names, file names) therefore can't touch the system.
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,      // the preload reads the config files with fs
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false,   // no <webview> — one less way to load foreign content
            // Sandbox / self-check windows are often hidden or covered: keep them rendering.
            backgroundThrottling: !SANDBOX,
        },
        autoHideMenuBar: true,
        show: !SMOKE,   // the self-check runs without flashing a window
    });

    if (!SMOKE) win.maximize();

    // Never spawn extra windows for foreign URLs (e.g. a link in remote content).
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    await win.loadFile('dist/index.html');

    if (openDevTools) {
        win.webContents.openDevTools();
    }
}

function setupContentSecurityPolicy() {
    // Scripts: only the app's own bundle — no eval, no inline, no remote code.
    // Styles stay 'unsafe-inline' (React style props, style-loader tags).
    const csp =
        "default-src 'self' library: mediacache:; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "img-src 'self' data: blob: file: library: mediacache: fsthumb: mangaimg: https: http:; " +
        "media-src 'self' data: blob: file: library: mediacache: https: http:; " +
        "font-src 'self' data: https://fonts.gstatic.com; " +
        "connect-src 'self' data: blob: library: mediacache: fsthumb: mangaimg:; " +
        "worker-src 'self' blob:; " +
        "object-src 'none'; " +
        "frame-src 'none';";

    // Only the app's own pages (file://): other windows — e.g. the Danbooru check —
    // show real websites that need their own scripts.
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        if (!details.url.startsWith('file:')) return callback({});
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [csp],
            },
        });
    });
}

// One listener for all hosts: Electron keeps only the last onBeforeSendHeaders
// registered on a session, so separate ones would silently replace each other.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';

function setupRequestHeaders() {
    const urls = ['*://*.rule34.xxx/*', '*://*.realbooru.com/*', '*://*.gelbooru.com/*', '*://*.donmai.us/*'];
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
        const host = new URL(details.url).hostname;
        const h = details.requestHeaders;
        if (host.endsWith('donmai.us')) {
            // Cloudflare: see danbooruAccess (API-client UA, or the browser UA once
            // a clearance cookie exists — it is bound to that UA).
            h['User-Agent'] = require('./server/services/danbooruAccess').userAgentFor(details);
        } else {
            h['User-Agent'] = BROWSER_UA;
            if (host.endsWith('gelbooru.com')) h['Referer'] = 'https://gelbooru.com/index.php';
        }
        callback({ requestHeaders: h });
    });
}

async function initDatabase() {
    try {
        await require('./server/services/librarySwitch').prepareDatabase();
        console.log('Database synchronized');
    } catch (err) {
        console.error('DB sync error:', err);
    }
}

// library://thumb|item|source/<id> → the file inside the item's folder. Served
// with Range support (fileResponse), so videos can seek.
function libraryFilePath(url) {
    const type = url.hostname;                          // 'thumb' | 'item' | 'source'
    const id = url.pathname.replace(/^\//, '');         // uuid

    // The id names a folder under the items folder — reject anything that isn't a
    // plain id segment so a crafted URL can't escape the items directory.
    if (!/^[A-Za-z0-9._-]+$/.test(id)) return null;

    if (type === 'thumb') return path.join(itemsPath(), id, 'thumb.jpg');

    const itemDir = path.join(itemsPath(), id);
    if (!fs.existsSync(itemDir)) return null;
    const files = fs.readdirSync(itemDir);

    if (type === 'source') {
        // The image editor's starting point: base.* (old cumulative edits kept
        // as the baseline) → source.* (pristine backup) → the original itself.
        const pick = files.find(f => /^base\./i.test(f))
            || files.find(f => /^source\./i.test(f))
            || files.find(f => f.startsWith('original'));
        return pick ? path.join(itemDir, pick) : null;
    }
    if (type === 'item') {
        // Manga: the item "is" its cover page.
        if (files.includes('manga.json')) return require('./server/services/manga/store').coverFile(id);
        // Prefer display.jpg (generated for HEIC/unsupported originals)
        if (files.includes('display.jpg')) return path.join(itemDir, 'display.jpg');
        const original = files.find(f => f.startsWith('original'));
        return original ? path.join(itemDir, original) : null;
    }
    return null;
}

// The protocol handlers are also kept for the phone / browser access (remote/server).
require('./server/remote/protocols').install(protocol);

function registerLibraryProtocol() {
    protocol.handle('library', async (request) => {
        try {
            const url = new URL(request.url);
            // Manga pages: library://page/<id>/<chapter>/<file>, previews: library://pthumb/…
            if (url.hostname === 'page' || url.hostname === 'pthumb') {
                const [, id, ...rest] = decodeURIComponent(url.pathname).split('/');
                if (!/^[A-Za-z0-9._-]+$/.test(id || '')) return new Response('bad id', { status: 400 });
                const store = require('./server/services/manga/store');
                const rel = rest.join('/');
                const file = url.hostname === 'page' ? store.resolvePage(id, rel) : await store.pageThumbFile(id, rel).catch(() => null);
                if (!file) return new Response('not found', { status: 404 });
                return fileResponse(file, request.headers.get('range'));
            }
            const filePath = libraryFilePath(url);
            if (!filePath || !fs.existsSync(filePath)) {
                console.error('[Protocol] File not found:', filePath);
                return new Response('not found', { status: 404 });
            }
            return fileResponse(filePath, request.headers.get('range'));
        } catch (e) {
            console.error('[Protocol] Error:', e);
            return new Response('error', { status: 500 });
        }
    });
}

// Pages of online manga: mangaimg://p/?s=<source>&u=<url>[&r=1] — fetched by the
// main process (referer, cookies of the manga session) and kept in a disk cache.
function registerMangaImageProtocol() {
    protocol.handle('mangaimg', async (request) => {
        try {
            const url = new URL(request.url);
            const source = url.searchParams.get('s');
            const src = url.searchParams.get('u');
            if (!source || !/^https?:\/\//.test(src || '')) return new Response('bad url', { status: 400 });
            const file = await require('./server/services/manga/images').fetchImage(source, src, { resolve: url.searchParams.get('r') === '1' });
            return fileResponse(file, request.headers.get('range'), { 'Cache-Control': 'max-age=86400' });
        } catch (e) {
            return new Response(e.message || 'error', { status: 502 });
        }
    });
}

protocol.registerSchemesAsPrivileged([
    {
        scheme: 'library',
        privileges: {
            secure: true,
            standard: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true,            // Range requests for library videos
        }
    },
    {
        // Cached thumbnails of files on disk (Folders browser) — see fsController.
        scheme: 'fsthumb',
        privileges: { secure: true, standard: true, supportFetchAPI: true },
    },
    {
        scheme: 'mangaimg',
        privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true },
    },
    {
        scheme: mediaCache.SCHEME,
        privileges: {
            secure: true,
            standard: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true,            // Range support for cached videos
        }
    }
]);

// Windows shows toast notifications (tray, watched folders) only for an app with an id.
if (process.platform === 'win32') app.setAppUserModelId('Darkframe');

app.whenReady().then(async () => {
    registerLibraryProtocol();
    registerMangaImageProtocol();
    require('./server/controllers/fsController').registerProtocol();

        mediaCache.clearCache();
    mediaCache.registerProtocol();

    setupIpcHandlers();

    await initDatabase();

    if (!SANDBOX) backupDatabase();

    setupContentSecurityPolicy();
    setupRequestHeaders();
    await require('./server/services/danbooruAccess').init().catch(() => {});

    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        let host = '';
        try { host = new URL(url).hostname; } catch { /* ignore */ }
        if (isTlsBypassHost(host)) {
            event.preventDefault();
            callback(true);   // trusted content host — accept
        } else {
            callback(false);  // strict TLS everywhere else
        }
    });

    await createWindow();

    win.webContents.on('will-navigate', (e) => e.preventDefault());

    win.webContents.session.on('will-download', (e) => e.preventDefault());

    app.on('open-file', (event, filePath) => {
        event.preventDefault();
        win.webContents.send('file-dropped', [filePath]);
    });

    if (SMOKE) require('./server/smoke').runSmokeCheck(win);
    else if (!SANDBOX) startApiServer();

    if (!SMOKE) require('./server/services/tray').init(win);

    if (!SMOKE) require('./server/services/watchFolders').start()
        .catch(e => console.warn('[watch] start failed:', e.message));

    // Phone / browser access over the home network, if switched on. A sandbox
    // instance only with its own port (DARKFRAME_REMOTE_PORT).
    if (!SMOKE && (!SANDBOX || process.env.DARKFRAME_REMOTE_PORT)) {
        require('./server/controllers/remoteController').startIfEnabled()
            .catch(e => console.warn('[remote] start failed:', e.message));
    }

    if (!SMOKE) {
        setTimeout(() => require('./server/services/manga/images').pruneCache(), 30000);
        require('./server/services/manga/downloads').start()
            .catch(e => console.warn('[manga] downloads:', e.message));
        require('./server/services/manga/subscriptions').start()
            .catch(e => console.warn('[manga] subscriptions:', e.message));
    }
});

app.on('window-all-closed', () => {
    stopApiServer();
    require('./server/remote/server').stop();
    require('./server/services/watchFolders').stop();
    require('./server/controllers/dragWheelController').stop();
    // Best-effort; the renderer may still hold file handles, so leftovers are
    // wiped on next launch (mediaCache.clearCache runs at whenReady).
    mediaCache.clearCache();
    app.quit();
});