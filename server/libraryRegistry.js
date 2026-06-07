/**
 * Library registry — manages the list of separate library databases and the
 * currently active one. The registry lives in the global JSON file
 * `<userData>/libraries.json`. Each library is a self-contained pair of:
 *   - dbPath:    absolute path to `library.db` (SQLite)
 *   - itemsPath: absolute path to the items folder
 *
 * On first run (no registry exists), we migrate the legacy layout — the
 * `data/data.db` from the project root + `Settings.LibraryPath/items` — as
 * "Default (Legacy)" so existing users don't lose anything.
 */

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { app } = require('electron');

const REGISTRY_FILENAME = 'libraries.json';
let _cache = null;

function registryPath() {
    return path.join(app.getPath('userData'), REGISTRY_FILENAME);
}

function defaultLegacyLibrary() {
    const Settings = require('../data/settings');
    const legacyDb    = path.resolve(__dirname, '..', 'data', 'data.db');
    const legacyItems = path.join(
        Settings.LibraryPath || path.join(app.getPath('userData'), 'library'),
        'items'
    );
    return {
        id:        'legacy',
        name:      'Default',
        dbPath:    legacyDb,
        itemsPath: legacyItems,
    };
}

function load() {
    if (_cache) return _cache;

    const p = registryPath();
    if (fs.existsSync(p)) {
        try {
            _cache = JSON.parse(fs.readFileSync(p, 'utf8'));
            // sanity defaults
            _cache.libraries ||= [];
            return _cache;
        } catch (e) {
            console.error('[libraryRegistry] failed to parse, recreating:', e);
        }
    }

    // First run — migrate legacy
    const legacy = defaultLegacyLibrary();
    _cache = {
        libraries: [legacy],
        activeId:  legacy.id,
    };
    save();
    return _cache;
}

function save() {
    if (!_cache) return;
    fs.mkdirSync(path.dirname(registryPath()), { recursive: true });
    fs.writeFileSync(registryPath(), JSON.stringify(_cache, null, 2), 'utf8');
}

function getActive() {
    const reg = load();
    const active = reg.libraries.find(l => l.id === reg.activeId) || reg.libraries[0];
    if (!active) throw new Error('No libraries registered');
    return active;
}

function listLibraries() {
    return load().libraries.slice();
}

function setActive(id) {
    const reg = load();
    if (!reg.libraries.some(l => l.id === id)) {
        throw new Error(`Library not found: ${id}`);
    }
    reg.activeId = id;
    save();
}

function addLibrary({ name, folderPath }) {
    const reg = load();
    const absFolder = path.resolve(folderPath);
    fs.mkdirSync(absFolder, { recursive: true });
    fs.mkdirSync(path.join(absFolder, 'items'), { recursive: true });

    const lib = {
        id:        uuidv4(),
        name:      name?.trim() || path.basename(absFolder),
        dbPath:    path.join(absFolder, 'library.db'),
        itemsPath: path.join(absFolder, 'items'),
    };
    reg.libraries.push(lib);
    save();
    return lib;
}

function removeLibrary(id, { deleteFiles = false } = {}) {
    const reg = load();
    const idx = reg.libraries.findIndex(l => l.id === id);
    if (idx === -1) return false;
    if (reg.libraries.length === 1) {
        throw new Error('Cannot remove the only registered library');
    }
    const [removed] = reg.libraries.splice(idx, 1);
    if (reg.activeId === id) reg.activeId = reg.libraries[0].id;
    save();

    if (deleteFiles) {
        const folder = path.dirname(removed.dbPath);
        try { fs.rmSync(folder, { recursive: true, force: true }); }
        catch (e) { console.warn('[libraryRegistry] could not delete files:', e); }
    }
    return true;
}

function renameLibrary(id, newName) {
    const reg = load();
    const lib = reg.libraries.find(l => l.id === id);
    if (!lib) return false;
    lib.name = newName.trim();
    save();
    return true;
}

module.exports = {
    getActive,
    listLibraries,
    setActive,
    addLibrary,
    removeLibrary,
    renameLibrary,
};
