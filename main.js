const {app, BrowserWindow, ipcRenderer} = require('electron');
const fs = require('fs');

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
    win.loadFile('index.html').then();

    win.webContents.openDevTools();
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    db.close()
    app.quit();
});

let { ipcMain } = require("electron")
function readdirSortTime(dir, timeKey = 'mtime') {
    return (
        fs.readdirSync(dir)
            .map(name => ({
                name,
                time: fs.statSync(`${dir}/${name}`)[timeKey].getTime()
            }))
            .sort((b, a) => (a.time - b.time)) // ascending
            .map(f => f.name)
    );
}

ipcMain.handle("getDirFiles", (event, dir) => {
    if(!fs.existsSync(dir))
        return null;
    let files = readdirSortTime(dir);

    if(files == null)
        return null;

    return JSON.stringify(files);
});

const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database('./data.db')

function UpdateFavs(event)
{
    let sql = `SELECT * FROM favorites ORDER BY display`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            throw err;
        }
        event.sender.send("getFavorites", rows);
    });
}

ipcMain.handle("getFavorites", (event) => {
    UpdateFavs(event);
})


ipcMain.handle("addFavorites", (event, _url, _name, _source, _tags) => {
    db.run(`INSERT INTO favorites (name, url, source, tags) VALUES (?,?,?,?);`, [_name, _url, _source, _tags], () => {UpdateFavs(event)} );
})

ipcMain.handle("removeFavorites", (event, _url) => {
    db.run(`DELETE FROM favorites WHERE url LIKE ?;`, [_url], () => {
        UpdateFavs(event);
    });
})

function UpdateFavTags(event)
{
    let sql = `SELECT * FROM favorites_tags ORDER BY display`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            throw err;
        }
        event.sender.send("getFavTags", rows);
    });
}

ipcMain.handle("getFavTags", (event) => {
    UpdateFavTags(event);
})

ipcMain.handle("AddFavTags", (event, _tag) => {
    AddFavTags(event, _tag);
})
function AddFavTags(event, _tag)
{
    db.run(`INSERT INTO favorites_tags (tag) VALUES (?);`, [_tag], () => {
        UpdateFavTags(event);
    });
}



