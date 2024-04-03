const {app, BrowserWindow} = require('electron');
const { backupDatabase } = require('./server/backup');
const { setupIpcHandlers } = require('./server/ipcManager');

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
            contextIsolation: false
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
});

app.on('window-all-closed', () => {
    app.quit();
});
