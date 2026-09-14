const { app, BrowserWindow, session } = require('electron');
const { backupDatabase } = require('./server/backup');
const { setupIpcHandlers } = require('./server/ipcManager');
const sequelize = require("./server/database");
const { protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { ITEMS_PATH, hashExistingItems } = require('./server/services/importService');
const { generateHeifDisplay } = require('./server/services/thumbService');
const mediaCache = require('./server/mediaCache');
const { migrations } = require("./server/migrations");
const { startApiServer, stopApiServer } = require('./server/apiServer');

app.commandLine.appendSwitch('disable-quic');
app.commandLine.appendSwitch('disable-http2');

// TLS-certificate errors are ignored ONLY for these content hosts (and their CDNs /
// subdomains), which are the sources that need it. Everything else keeps strict TLS,
// so a MITM on, say, a bank or update server is no longer silently accepted.
// Matching by target host works even behind a TLS-intercepting proxy, since the SNI
// host is still the real destination.
const TLS_BYPASS_HOSTS = ['rule34.xxx', 'realbooru.com', 'gelbooru.com'];
const isTlsBypassHost = (host) =>
    !!host && TLS_BYPASS_HOSTS.some(h => host === h || host.endsWith('.' + h));

let openDevTools = process.argv.includes('devtools');

let win;
async function createWindow() {
    win = new BrowserWindow({
        width: 700,
        height: 500,
        icon: __dirname + "/img/icon.svg",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            allowDisplayingInsecureContent: true,
            allowRunningInsecureContent: true,
            webSecurity: false,
        },
        autoHideMenuBar: true,
    });

    win.maximize();
    await win.loadFile('dist/index.html');

    if (openDevTools) {
        win.webContents.openDevTools();
    }
}

function setupRequestHeaders() {
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://*.rule34.xxx/*', '*://*.realbooru.com/*'] } , (details, callback) => {
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
        callback({ requestHeaders: details.requestHeaders })
    });

    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://*.gelbooru.com/*'] } , (details, callback) => {
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
        details.requestHeaders['Referer'] = 'https://gelbooru.com/index.php';
        callback({ requestHeaders: details.requestHeaders })
    });
}

async function initDatabase() {
    try {
        await sequelize.authenticate();
        await sequelize.query('PRAGMA journal_mode = WAL;');
        await sequelize.query('PRAGMA busy_timeout = 5000;');

        await sequelize.sync();
        await migrations();
        await require('./server/favoritesCollection').ensureFavoritesCollection();
        console.log('Database synchronized');
        hashExistingItems();
    } catch (err) {
        console.error('DB sync error:', err);
    }
}

function registerLibraryProtocol() {
    protocol.registerFileProtocol('library', (request, callback) => {
        try {
            const url = new URL(request.url);
            const type = url.hostname;                          // 'thumb' или 'item'
            const id = url.pathname.replace(/^\//, '');        // uuid

            // The id names a folder under ITEMS_PATH — reject anything that isn't a
            // plain id segment so a crafted URL can't escape the items directory.
            if (!/^[A-Za-z0-9._-]+$/.test(id)) {
                return callback({ error: -6 });
            }

            let filePath;

            if (type === 'thumb') {
                filePath = path.join(ITEMS_PATH, id, 'thumb.jpg');
            } else if (type === 'item') {
                const itemDir = path.join(ITEMS_PATH, id);
                if (!fs.existsSync(itemDir)) return callback({ error: -6 });

                // Prefer display.jpg (generated for HEIC/unsupported originals)
                const displayFile = path.join(itemDir, 'display.jpg');
                if (fs.existsSync(displayFile)) {
                    filePath = displayFile;
                } else {
                    const files = fs.readdirSync(itemDir);
                    const original = files.find(f => f.startsWith('original'));
                    filePath = original ? path.join(itemDir, original) : null;
                }
            }

            if (!filePath || !fs.existsSync(filePath)) {
                console.error('[Protocol] File not found:', filePath);
                return callback({ error: -6 });
            }

            callback({ path: filePath });
        } catch (e) {
            console.error('[Protocol] Error:', e);
            callback({ error: -2 });
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
        }
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

app.whenReady().then(async () => {
    registerLibraryProtocol();

    // Fresh media cache each session, then register the caching protocol
    mediaCache.clearCache();
    mediaCache.registerProtocol();

    setupIpcHandlers();

    await initDatabase();

    backupDatabase();

    setupRequestHeaders();

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

    startApiServer();
});

app.on('window-all-closed', () => {
    stopApiServer();
    // Best-effort; the renderer may still hold file handles, so leftovers are
    // wiped on next launch (mediaCache.clearCache runs at whenReady).
    mediaCache.clearCache();
    app.quit();
});