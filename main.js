const {app, BrowserWindow} = require('electron');
const { backupDatabase } = require('./server/backup');
const { setupIpcHandlers } = require('./server/ipcManager');
const { downloadMissingFavorites } = require('./server/controllers/favoriteController');
const { session } = require('electron')

app.commandLine.appendSwitch('disable-quic');
app.commandLine.appendSwitch('disable-http2');
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('ignore-ssl-errors');

let openDevTools = false;
for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === 'devtools') {
        openDevTools = true;
        break;
    }
}

let win;
function createWindow() {
    win = new BrowserWindow({
        width: 700,
        height: 500,
        icon: __dirname + "/img/icon.svg",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            allowDisplayingInsecureContent: true,
            allowRunningInsecureContent: true,
        }
    });
    win.maximize();
    win.loadFile('dist/index.html').then();
    if (openDevTools) {
        win.webContents.openDevTools();
    }
}

backupDatabase();

app.whenReady().then(() => {
    setupIpcHandlers();
    createWindow();

    const filter = {
        urls: ['*']
    }

    session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
        callback({ requestHeaders: details.requestHeaders })
    })

    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        event.preventDefault()
        callback(true)

    })

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    return;
    downloadMissingFavorites().then(r => {
        console.log("Все файлы проверены и недостающие скачаны.");
    });
});

app.on('window-all-closed', () => {
    app.quit();
});
