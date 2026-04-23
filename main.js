const {app, BrowserWindow} = require('electron');
const { backupDatabase } = require('./server/backup');
const { setupIpcHandlers } = require('./server/ipcManager');
const { downloadMissingFavorites } = require('./server/controllers/favoriteController');
const { session } = require('electron')
const Settings = require("./data/settings");
const PrivateData = require("./data/private");

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
    if(Settings.HttpProxy) {
        try {
            await session.defaultSession.setProxy({
                proxyRules: `http://${PrivateData.HttpProxy.ip}:${PrivateData.HttpProxy.port}`,
                proxyBypassRules: "localhost,127.0.0.1"
            });
        } catch (e) {
            console.error("Failed to set proxy:", e);
        }
    }

    win.maximize();
    await win.loadFile('dist/index.html');

    if (openDevTools) {
        win.webContents.openDevTools();
    }
}

backupDatabase();

app.whenReady().then(() => {
    setupIpcHandlers();
    createWindow();

    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://*.rule34.xxx/*', '*://*.realbooru.com/*'] } , (details, callback) => {
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
        callback({ requestHeaders: details.requestHeaders })
    });

    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://*.gelbooru.com/*'] } , (details, callback) => {
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
        details.requestHeaders['Referer'] = 'https://gelbooru.com/index.php';
        callback({ requestHeaders: details.requestHeaders })
    });

    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        event.preventDefault()
        callback(true)

    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    return;
    downloadMissingFavorites().then(r => {
        console.log("Все файлы проверены и недостающие скачаны.");
    });
});

app.on('login', (event, webContents, request, authInfo, callback) => {
    if (authInfo.isProxy) {
        event.preventDefault();
        console.log("🔑 Авторизация на прокси...");
        callback(PrivateData.HttpProxy.login, PrivateData.HttpProxy.password);
    }
});

app.on('window-all-closed', () => {
    app.quit();
});