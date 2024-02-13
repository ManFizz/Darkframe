const {app, BrowserWindow, ipcRenderer} = require('electron');
const fs = require('fs');

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

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    db.close();
    app.quit();
});

let { ipcMain } = require("electron")
function readDirSortTime(dir, timeKey = 'mtime') {
    return (
        fs.readdirSync(dir)
            .map(name => ({
                name,
                time: fs.statSync(`${dir}/${name}`)[timeKey].getTime()
            }))
            .sort((b, a) => (a.time - b.time)) // ascending
            //.map(f => f.name)
    );
}

ipcMain.handle("getDirFiles", (event, dir) => {
    if(!fs.existsSync(dir))
        return null;

    let files = readDirSortTime(dir);

    return files != null ? JSON.stringify(files) : null;
});

const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database('./data.db')

function UpdateFavorites(event)
{
    const sql = `SELECT * FROM favorites ORDER BY display`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            throw err;
        }
        event.sender.send("getFavorites", rows);
    });
}

function UpdateFavoriteTags(event)
{
    const sql = `SELECT * FROM favorites_tags ORDER BY display`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            throw err;
        }
        event.sender.send("getFavTags", rows);
    });
}

function AddFavTags(event, _tag){
    db.run(`INSERT INTO favorites_tags (tag) VALUES (?);`, [_tag], () => { UpdateFavoriteTags(event) });
}

ipcMain.handle("getFavorites", (event) => { UpdateFavorites(event) })

ipcMain.handle("addFavorites", (event, _url, _name, _source, _tags, _display, _remote_type) => {
    db.run(`INSERT INTO favorites (name, url, source, tags, display, remote_type) VALUES (?,?,?,?,?,?);`,
        [_name, _url, _source, _tags, _display, _remote_type], () => { UpdateFavorites(event) });
})

ipcMain.handle("removeFavorites", (event, _url) => {
    db.run(`DELETE FROM favorites WHERE url LIKE ?;`, [_url],
        () => { UpdateFavorites(event) });
})

ipcMain.handle("getFavTags", (event) => { UpdateFavoriteTags(event) })

ipcMain.handle("AddFavTags", (event, _tag) => { AddFavTags(event, _tag) })



