/**
 * Test sandbox for main-process code under plain `node --test`.
 *
 *  - Replaces the `electron` module with a small fake (app.getPath → temp dir,
 *    no windows, inert ipcMain) — in plain node `require('electron')` is only the
 *    binary path.
 *  - Writes a libraries.json into the fake userData that points at a temp DB and
 *    items folder. This matters: without a registry the app falls back to the
 *    project's real data/data.db.
 *
 * Must be required before anything under server/. Each test file runs in its own
 * process, so every file gets a fresh, empty library.
 */
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const dir      = fs.mkdtempSync(path.join(os.tmpdir(), 'darkframe-test-'));
const userData = path.join(dir, 'userData');
const libDir   = path.join(dir, 'library');
const dbPath   = path.join(libDir, 'library.db');
const itemsPath = path.join(libDir, 'items');

fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(itemsPath, { recursive: true });
fs.writeFileSync(path.join(userData, 'libraries.json'), JSON.stringify({
    libraries: [{ id: 'test', name: 'Test', dbPath, itemsPath }],
    activeId: 'test',
}));

const sent = [];   // everything broadcast to "windows"
const fakeElectron = {
    app: {
        getPath: (name) => (name === 'userData' ? userData : path.join(dir, name)),
        getName: () => 'darkframe-test',
        isPackaged: false,
        on() {}, relaunch() {}, exit() {},
    },
    BrowserWindow: {
        getAllWindows: () => [{ webContents: { isDestroyed: () => false, send: (ch, p) => sent.push([ch, p]) } }],
    },
    ipcMain: { handle() {}, on() {}, removeHandler() {} },
    net: { fetch: (...a) => fetch(...a) },
    protocol: { registerFileProtocol() {}, handle() {} },
    shell: { showItemInFolder() {} },
    dialog: {},
};

const electronId = require.resolve('electron', { paths: [ROOT] });
require.cache[electronId] = { id: electronId, filename: electronId, loaded: true, exports: fakeElectron };

// Refuse to run against the real database, whatever happens above.
const registry = require(path.join(ROOT, 'server', 'libraryRegistry'));
if (path.resolve(registry.getActive().dbPath) !== path.resolve(dbPath)) {
    throw new Error('sandbox: registry does not point at the temp DB — refusing to continue');
}

// Schema + migrations exactly as main.js does it on startup.
async function initDb() {
    const sequelize = require(path.join(ROOT, 'server', 'database'));
    require(path.join(ROOT, 'server', 'models', 'associations'));
    await sequelize.authenticate();
    await sequelize.sync();
    await require(path.join(ROOT, 'server', 'migrations')).migrations();
    return sequelize;
}

async function cleanup() {
    try { await require(path.join(ROOT, 'server', 'database')).close(); } catch { /* not opened */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* locked on Windows */ }
}

const serverPath = (...p) => path.join(ROOT, 'server', ...p);

module.exports = { ROOT, dir, dbPath, itemsPath, sent, initDb, cleanup, serverPath };
