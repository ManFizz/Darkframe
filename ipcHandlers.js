const { ipcMain, app} = require("electron");
const fs = require("fs");
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbName = 'data.db';

const dbInitSqlPath = path.join(__dirname, 'db_init.sql');

let db;

async function FastSQL(str, data = []) {
    return await new Promise((resolve, reject)=>{
        db.all(str, data, (err, rows) => {
            if(err)
                reject(err);
            resolve(rows);
        });
    });
}

function executeSqlFile(db, filePath) {
    console.log('Running init sql...');
    const sql = fs.readFileSync(filePath, 'utf-8');
    db.exec(sql, function(err) {
        if (err) {
            console.error('Error executing SQL:', err.message);
        } else {
            console.log('SQL queries executed successfully');
        }
    });
}

function initDatabase() {
    const dbPath = path.join(__dirname, dbName);
    const db = new sqlite3.Database(dbPath);

    if (!fs.existsSync(dbPath)) {
        console.log('db not exists! Create new in: ' + dbPath);
        db.serialize(() => {
            db.run('PRAGMA foreign_keys = ON;');
            executeSqlFile(db, dbInitSqlPath);
        });
    }

    return db;
}

app.on('ready', () => {
    db = initDatabase();
});

app.on('window-all-closed', () => {
    db.close();
    app.quit();
});

function readDir(dir, timeKey = 'mtime') {
    return fs.readdirSync(dir).map(name => {
        const stats = fs.statSync(`${dir}/${name}`);
        return {
            name,
            time: stats[timeKey].getTime(),
            isDir: stats.isDirectory(),
        };
    });
}

ipcMain.handle("getDirFiles", (event, dir) => {
    if(!fs.existsSync(dir))
        return null;

    let files = readDir(dir);
    return files != null ? JSON.stringify(files) : null;
});


ipcMain.handle("getFavorites", UpdateFavorites);
function UpdateFavorites(event) {
    const sql = `SELECT * FROM favorites ORDER BY display`;
    db.all(sql, [], (err, rows) => {
        if (err) throw err;
        event.sender.send("getFavorites", rows);
    });
}

ipcMain.handle("getFavTags", async (event) => {
    return await UpdateFavoriteTags(event);
});
async function UpdateFavoriteTags() {
    return await FastSQL(`SELECT * FROM favorites_tags ORDER BY display`);
}

function AddFavTags(event, _tag, _remote_type) {
    const sql = `INSERT INTO favorites_tags (tag, remote_type) VALUES (?, ?);`;
    db.run(sql, [_tag, _remote_type], async () =>  {
        event.sender.send("getFavTags", await UpdateFavoriteTags(event));
    });
}

ipcMain.handle("addFavorites", (event, _url, _name, _source, _tags, _display, _remote_type) => {
    const sql = `INSERT INTO favorites (name, url, source, tags, display, remote_type) VALUES (?,?,?,?,?,?);`;
    db.run(sql, [_name, _url, _source, _tags, _display, _remote_type], () => {
        UpdateFavorites(event);
    });
})

ipcMain.handle("removeFavorites", (event, _url) => {
    const sql = `DELETE FROM favorites WHERE url LIKE ?;`;
    db.run(sql, [_url], () => {
        UpdateFavorites(event);
    });
})

ipcMain.handle("AddFavTags", (event, _tag, _remote_type) => {
    AddFavTags(event, _tag, _remote_type);
});

ipcMain.handle("GetCollections", async (event) => {
    return await FastSQL(`SELECT c.id colId, c.name colName, f.id FROM collections c `
      + `JOIN collections_favs cf ON c.id = cf.id_col JOIN favorites f ON cf.id_fav = f.id`);
});

ipcMain.handle("UpdateCollections", async (event, collections) => {
    try {
        await FastSQL("DELETE FROM collections");
        await FastSQL("DELETE FROM collections_favs");

        for (const collection of collections) {
            const { name, images } = collection;
            const colId = await FastSQL("INSERT INTO collections (name) VALUES (?)", [name]);

            for (const image of images) {
                await FastSQL("INSERT INTO collections_favs (id_col, id_fav) VALUES (?, ?)", [colId, image.id]);
            }
        }
    } catch (error) {
        console.error("Error updating collections:", error);
    }
});

module.exports = ipcMain;