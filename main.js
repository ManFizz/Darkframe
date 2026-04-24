const { app, BrowserWindow, session } = require('electron');
const { backupDatabase } = require('./server/backup');
const { setupIpcHandlers } = require('./server/ipcManager');
const sequelize = require("./server/database");
const { downloadMissingFavorites } = require('./server/controllers/favoriteController');

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
        await sequelize.sync();
        console.log('Database synchronized');
    } catch (err) {
        console.error('DB sync error:', err);
    }
}

app.whenReady().then(async () => {
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

    downloadMissingFavorites().then(() => {
        console.log("Все файлы проверены и недостающие скачаны.");
    });
});

app.on('window-all-closed', () => {
    app.quit();
});