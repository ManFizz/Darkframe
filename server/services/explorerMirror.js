const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { QueryTypes } = require('sequelize');
const sequelize = require('../database');
const registry = require('../libraryRegistry');

/**
 * "The library as a folder in Explorer": a folder tree mirroring the collections,
 * with every media under a readable name. Each file is a hard link to the item's
 * original.* — no extra disk space, native thumbnails, any program can open it.
 *
 * One way only: the app rebuilds the mirror after library changes; renaming or
 * moving files in the mirror changes nothing in the library (the next sync puts
 * them back). Hard links need the mirror on the same disk as the items folder.
 *
 * What was created is remembered in a manifest in userData (per library), and only
 * those files and folders are ever removed — anything else in the folder is left.
 *
 *   <mirror>/<Collection>/<Sub-collection>/<title>.<ext>
 *   <mirror>/Без коллекции/…                    items outside any collection
 *   <mirror>/…/<manga title>/[<chapter>/]0001.jpg
 */

const LOOSE_DIR = 'Без коллекции';
const MANGA_MIME = 'application/x-darkframe-manga';
const DIR_MAX = 60;       // characters of a folder name
const FILE_MAX = 90;      // characters of a file name (without the extension)
const SLICE = 150;        // file operations between yields to the event loop

const manifestFile = (libId) => path.join(app.getPath('userData'), `explorer-mirror-${libId}.json`);
const defaultPath = (lib) => path.join(path.dirname(lib.itemsPath), 'Библиотека');

function config(lib = registry.getActive()) {
    const m = lib.mirror || {};
    return { enabled: !!m.enabled, path: m.path || defaultPath(lib) };
}

function loadManifest(libId) {
    try {
        const m = JSON.parse(fs.readFileSync(manifestFile(libId), 'utf8'));
        return { root: m.root || null, files: m.files || {}, dirs: m.dirs || [], at: m.at || null };
    } catch { return { root: null, files: {}, dirs: [], at: null }; }
}

function saveManifest(libId, m) {
    const file = manifestFile(libId);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(m));
    fs.renameSync(tmp, file);
}

// ── Names ───────────────────────────────────────────────────────────────────────

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** A string usable as one Windows file/folder name, at most `max` characters. */
function cleanName(s, max) {
    let n = String(s || '').normalize('NFC')
        .replace(/[\u0000-\u001f<>:"/\\|?*\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const chars = [...n];
    if (chars.length > max) n = chars.slice(0, max).join('').trim();
    n = n.replace(/[. ]+$/, '');
    if (!n) n = 'Без названия';
    if (RESERVED.test(n.split('.')[0])) n = `_${n}`;
    return n;
}

// Names taken per folder, case-insensitively (as Windows compares them).
function namer() {
    const used = new Map();
    return (dir, base, ext = '') => {
        const key = dir.toLowerCase();
        if (!used.has(key)) used.set(key, new Set());
        const set = used.get(key);
        let name = base + ext;
        for (let k = 2; set.has(name.toLowerCase()); k++) name = `${base} (${k})${ext}`;
        set.add(name.toLowerCase());
        return dir ? path.join(dir, name) : name;
    };
}

const stripExt = (f) => String(f || '').replace(/\.[^.\\/]{1,8}$/, '');

// ── What the mirror should contain ──────────────────────────────────────────────

function originalOf(itemsPath, id) {
    try {
        const f = fs.readdirSync(path.join(itemsPath, id)).find(x => /^original\./i.test(x));
        return f || null;
    } catch { return null; }
}

function mangaPages(itemsPath, id) {
    const file = path.join(itemsPath, id, 'manga.json');
    try {
        const stamp = String(fs.statSync(file).mtimeMs);
        const m = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { stamp, chapters: (m.chapters || []).filter(c => c.pages?.length) };
    } catch { return null; }
}

/**
 * Map lower-cased relative path → { rel, id, src, stamp }. `src` is the file inside
 * the item's folder; `stamp` changes whenever that file may have been replaced.
 */
async function plan(lib, prev) {
    const cols = await sequelize.query(
        'SELECT id, name, parentId, isSmart FROM Collections ORDER BY createdAt, id', { type: QueryTypes.SELECT });
    const items = await sequelize.query(
        `SELECT id, title, fileName, collectionId, mimeType, fileHash, editedAt FROM Items
         WHERE deletedAt IS NULL ORDER BY importedAt, id`, { type: QueryTypes.SELECT });

    const name = namer();
    const real = cols.filter(c => !c.isSmart);
    const known = new Set(real.map(c => String(c.id)));
    const children = new Map();
    for (const c of real) {
        const parent = c.parentId != null && known.has(String(c.parentId)) ? String(c.parentId) : '';
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(c);
    }
    const dirOf = new Map();
    const walk = (parentKey, dir) => {
        for (const c of children.get(parentKey) || []) {
            const id = String(c.id);
            if (dirOf.has(id)) continue;   // a broken parent loop
            const rel = name(dir, cleanName(c.name, DIR_MAX));
            dirOf.set(id, rel);
            walk(id, rel);
        }
    };
    walk('', '');
    let loose = null;
    const looseDir = () => (loose ??= name('', LOOSE_DIR));

    // Previous entries by item, so unchanged items need no folder listing.
    const prevSrc = new Map();
    for (const e of Object.values(prev.files)) if (!prevSrc.has(e.id)) prevSrc.set(e.id, e);

    const want = new Map();
    const put = (rel, id, src, stamp) => want.set(rel.toLowerCase(), { rel, id, src, stamp });
    let missing = 0;
    for (let k = 0; k < items.length; k++) {
        const it = items[k];
        const id = String(it.id);
        const dir = (it.collectionId != null && dirOf.get(String(it.collectionId))) || looseDir();
        const base = cleanName(it.title || stripExt(it.fileName), FILE_MAX);

        if (it.mimeType === MANGA_MIME) {
            const m = mangaPages(lib.itemsPath, id);
            if (!m || !m.chapters.length) { missing++; continue; }
            const book = name(dir, base);
            m.chapters.forEach((c, ci) => {
                const chDir = m.chapters.length > 1
                    ? name(book, cleanName(c.title || `Глава ${ci + 1}`, DIR_MAX))
                    : book;
                c.pages.forEach((p, pi) => {
                    const ext = path.extname(p.file || '').toLowerCase();
                    put(name(chDir, String(pi + 1).padStart(4, '0'), ext), id, path.join('pages', p.file), m.stamp);
                });
            });
            continue;
        }

        const stamp = `${it.fileHash || ''}|${it.editedAt || ''}`;
        const p = prevSrc.get(id);
        const src = p && p.stamp === stamp && !p.src.includes(path.sep) ? p.src : originalOf(lib.itemsPath, id);
        if (!src) { missing++; continue; }
        put(name(dir, base, path.extname(src).toLowerCase()), id, src, stamp);
        if (k % 2000 === 0) await tick();
    }
    return { want, missing };
}

// ── Applying it ─────────────────────────────────────────────────────────────────

const tick = () => new Promise(r => setImmediate(r));

function sameFile(a, b) {
    try {
        const x = fs.statSync(a, { bigint: true }), y = fs.statSync(b, { bigint: true });
        return x.ino === y.ino && x.dev === y.dev;
    } catch { return false; }
}

const inside = (child, parent) => {
    const rel = path.relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

function ancestors(rel, into) {
    for (let d = path.dirname(rel); d && d !== '.'; d = path.dirname(d)) {
        if (into.has(d.toLowerCase())) break;
        into.set(d.toLowerCase(), d);
    }
}

// Remove the folders we made that are no longer wanted. One holding something of
// the user's stays (and is forgotten); a busy one is retried next time.
function pruneDirs(root, dirs, keep) {
    const left = [];
    const sorted = [...dirs].sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
    for (const d of sorted) {
        if (keep.has(d.toLowerCase())) continue;
        try { fs.rmdirSync(path.join(root, d)); }
        catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTEMPTY' && e.code !== 'EEXIST') left.push(d); }
    }
    return left;
}

let state = { running: false, done: 0, total: 0, files: 0, missing: 0, failed: 0, lastSync: null, lastError: null };

function publish(extra = {}) {
    state = { ...state, ...extra };
    // Desktop windows only: the status carries paths on this PC.
    try {
        const { BrowserWindow } = require('electron');
        const payload = status();
        for (const win of BrowserWindow.getAllWindows()) {
            if (win.webContents && !win.webContents.isDestroyed()) win.webContents.send('library:mirrorStatus', payload);
        }
    } catch { /* tests */ }
}

/** Remove everything the manifest says we made. */
async function removeAll(libId, mf) {
    if (!mf.root) return;
    let n = 0;
    const left = {};
    for (const [rel, e] of Object.entries(mf.files)) {
        try { fs.unlinkSync(path.join(mf.root, rel)); }
        catch (err) { if (err.code !== 'ENOENT') left[rel] = e; }
        if (++n % SLICE === 0) await tick();
    }
    const dirs = pruneDirs(mf.root, mf.dirs, new Map());
    if (!Object.keys(left).length && !dirs.length) {
        try { fs.rmdirSync(mf.root); } catch { /* not empty: something of the user's is there */ }
        try { fs.unlinkSync(manifestFile(libId)); } catch { /* none */ }
    } else {
        saveManifest(libId, { ...mf, files: left, dirs });
        throw new Error(`Не удалось убрать ${Object.keys(left).length + dirs.length} файлов/папок — возможно, они открыты в другой программе`);
    }
}

async function syncNow({ full = false } = {}) {
    const lib = registry.getActive();
    const cfg = config(lib);
    let mf = loadManifest(lib.id);

    if (!cfg.enabled) {
        await removeAll(lib.id, mf);
        state.files = 0;
        return;
    }
    const root = path.resolve(cfg.path);
    if (mf.root && path.resolve(mf.root).toLowerCase() !== root.toLowerCase()) {
        await removeAll(lib.id, mf);   // the folder was moved: clear the old one
        mf = loadManifest(lib.id);
    }
    checkLocation(lib, root);
    fs.mkdirSync(root, { recursive: true });

    const { want, missing } = await plan(lib, mf);
    const items = lib.itemsPath;
    const next = { root, files: {}, dirs: [], at: null };
    let failed = 0, ops = 0, done = 0;
    const total = want.size;
    publish({ running: true, done: 0, total, missing });
    const step = async () => {
        if (++ops % SLICE === 0) { publish({ done }); await tick(); }
    };

    try {
        // What's there and still right stays; the rest goes.
        for (const [rel, e] of Object.entries(mf.files)) {
            const w = want.get(rel.toLowerCase());
            const same = w && w.rel === rel && w.id === e.id && w.src === e.src && w.stamp === e.stamp;
            if (same && (!full || sameFile(path.join(root, rel), path.join(items, e.id, e.src)))) {
                next.files[rel] = e;
                w.done = true;
                done++;
                if (full) await step();
                continue;
            }
            try { fs.unlinkSync(path.join(root, rel)); }
            catch (err) {
                if (err.code !== 'ENOENT') {   // open somewhere: retried next time
                    next.files[rel] = e;
                    if (w && w.rel.toLowerCase() === rel.toLowerCase()) w.done = true;
                    failed++;
                }
            }
            await step();
        }

        for (const w of want.values()) {
            if (w.done) continue;
            const dest = path.join(root, w.rel);
            const src = path.join(items, w.id, w.src);
            try {
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                try { fs.linkSync(src, dest); }
                catch (err) {
                    if (err.code !== 'EEXIST' || !sameFile(src, dest)) throw err;   // someone else's file there
                }
                next.files[w.rel] = { id: w.id, src: w.src, stamp: w.stamp };
            } catch (err) {
                if (err.code === 'EXDEV') {
                    throw new Error(`Папка должна быть на том же диске, что и библиотека (${path.parse(items).root})`);
                }
                failed++;
                if (failed <= 5) console.warn('[mirror]', w.rel, err.message);
            }
            done++;
            await step();
        }
    } finally {
        const keep = new Map();
        for (const rel of Object.keys(next.files)) ancestors(rel, keep);
        next.dirs = [...keep.values(), ...pruneDirs(root, mf.dirs, keep)];
        next.at = Date.now();
        saveManifest(lib.id, next);
        state.files = Object.keys(next.files).length;
    }
    state.failed = failed;
}

function checkLocation(lib, root) {
    if (!path.isAbsolute(root)) throw new Error('Нужен полный путь к папке');
    const items = path.resolve(lib.itemsPath);
    if (inside(root, items) || inside(items, root)) {
        throw new Error('Папка не может быть внутри папки библиотеки или содержать её');
    }
    if (path.parse(root).root.toLowerCase() !== path.parse(items).root.toLowerCase()) {
        throw new Error(`Папка должна быть на том же диске, что и библиотека (${path.parse(items).root})`);
    }
}

// ── Scheduling ──────────────────────────────────────────────────────────────────

let running = null, again = false, wantFull = false, timer = null;

function run() {
    timer = null;
    if (running) { again = true; return running; }
    const full = wantFull;
    wantFull = false;
    publish({ running: true, lastError: null });
    running = syncNow({ full })
        .then(() => publish({ running: false, lastSync: Date.now(), lastError: null }))
        .catch(e => { console.warn('[mirror] sync failed:', e.message); publish({ running: false, lastError: e.message }); })
        .finally(() => {
            running = null;
            if (again) { again = false; schedule({ delay: 500 }); }
        });
    return running;
}

/** Sync soon. Changes during a long import come together: the first one starts the timer. */
function schedule({ full = false, delay = 3000 } = {}) {
    if (full) wantFull = true;
    let enabled = false, had = false;
    try {
        const lib = registry.getActive();
        enabled = config(lib).enabled;
        had = !!loadManifest(lib.id).root;
    } catch { return; }
    if (!enabled && !had) return;
    if (timer) return;
    timer = setTimeout(run, delay);
}

/** Sync right now and wait for it. */
async function syncAndWait({ full = true } = {}) {
    clearTimeout(timer);
    timer = null;
    if (running) await running;
    wantFull = wantFull || full;
    await run();
    return status();
}

function status() {
    let lib, cfg;
    try { lib = registry.getActive(); cfg = config(lib); } catch { return { ...state }; }
    return { ...state, enabled: cfg.enabled, path: cfg.path, defaultPath: defaultPath(lib) };
}

/** Turn on / off or move the mirror of the active library; rebuilds right away. */
async function setConfig({ enabled, path: dir }) {
    const lib = registry.getActive();
    const cur = config(lib);
    const target = path.resolve(dir || cur.path);
    if (enabled) {
        checkLocation(lib, target);
        const mf = loadManifest(lib.id);
        const ours = mf.root && path.resolve(mf.root).toLowerCase() === target.toLowerCase();
        if (!ours && fs.existsSync(target) && fs.readdirSync(target).length) {
            throw new Error('Папка не пустая — выбери пустую или новую');
        }
    }
    registry.setMirror(lib.id, { enabled: !!enabled, path: target });
    return syncAndWait({ full: true });
}

let hooked = false;
function installHooks() {
    if (hooked) return;
    hooked = true;
    const Item = require('../models/Item');
    const Collection = require('../models/Collection');
    const later = () => schedule();
    for (const model of [Item, Collection]) {
        for (const h of ['afterCreate', 'afterBulkCreate', 'afterUpdate', 'afterBulkUpdate', 'afterDestroy', 'afterBulkDestroy']) {
            model.addHook(h, 'explorerMirror', later);
        }
    }
}

module.exports = { status, setConfig, schedule, syncAndWait, installHooks, cleanName, defaultPath, plan };
