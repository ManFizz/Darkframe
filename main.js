const { app, BrowserWindow, session } = require('electron');
const { backupDatabase } = require('./server/backup');
const { setupIpcHandlers } = require('./server/ipcManager');
const sequelize = require("./server/database");
const { downloadMissingFavorites } = require('./server/controllers/favoriteController');
const { protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { ITEMS_PATH, hashExistingItems } = require('./server/services/importService');
const { migrations } = require("./server/migrations");
const { startApiServer, stopApiServer } = require('./server/apiServer');

app.commandLine.appendSwitch('disable-quic');
app.commandLine.appendSwitch('disable-http2');
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('ignore-ssl-errors');

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

            let filePath;

            if (type === 'thumb') {
                filePath = path.join(ITEMS_PATH, id, 'thumb.jpg');
            } else if (type === 'item') {
                const itemDir = path.join(ITEMS_PATH, id);
                if (!fs.existsSync(itemDir)) return callback({ error: -6 });

                const files = fs.readdirSync(itemDir);
                const original = files.find(f => f.startsWith('original'));
                filePath = original ? path.join(itemDir, original) : null;
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
    }
]);

app.whenReady().then(async () => {
    registerLibraryProtocol();

    setupIpcHandlers();

    await initDatabase();

    backupDatabase();

    setupRequestHeaders();

    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        event.preventDefault();
        callback(true);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    await createWindow();

    win.webContents.on('will-navigate', (e) => e.preventDefault());

    win.webContents.session.on('will-download', (e) => e.preventDefault());

    app.on('open-file', (event, filePath) => {
        event.preventDefault();
        win.webContents.send('file-dropped', [filePath]);
    });

    downloadMissingFavorites().then(() => {
        console.log("Все файлы проверены и недостающие скачаны.");
    });

    startApiServer();
});

app.on('window-all-closed', () => {
    stopApiServer();
    app.quit();
});