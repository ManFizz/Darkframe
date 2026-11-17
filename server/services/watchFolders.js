const fs = require('fs');
const path = require('path');
const WatchedFolder = require('../models/WatchedFolder');
const { importFile, SUPPORTED_EXTENSIONS } = require('./importService');
const { broadcast } = require('./libraryEvents');

/**
 * Watched folders: new media files that appear in them are copied into the library.
 *
 *  - fs.watch (recursive on Windows / macOS) for files arriving while the app runs;
 *  - a catch-up scan on start for files changed since the folder's lastScanAt;
 *  - browser downloads in progress (.crdownload, .part, …) are ignored, and a file
 *    is imported only once its size stops changing.
 *
 * Imports run one at a time; duplicates are skipped by the importer's hash check.
 */

const PARTIAL = /\.(crdownload|part|partial|download|tmp|temp|opdownload)$/i;
const opts = { stableMs: 1500, maxWaitMs: 20 * 60 * 1000 };

const watchers = new Map();     // folder id → fs.FSWatcher
const pending  = new Map();     // file path → timer
const status   = new Map();     // folder id → { imported, error }
let queue = Promise.resolve();
let running = false;

const parseTags = (s) => { try { return JSON.parse(s) || []; } catch { return []; } };
const toDto = (row) => ({
    ...row,
    enabled: !!row.enabled,
    recursive: !!row.recursive,
    tags: parseTags(row.tags),
    lastScanAt: Number(row.lastScanAt) || 0,
    watching: watchers.has(row.id),
    imported: status.get(row.id)?.imported || 0,
    error: status.get(row.id)?.error || null,
});

function isCandidate(file) {
    const name = path.basename(file);
    if (name.startsWith('.') || name.startsWith('~$')) return false;
    if (PARTIAL.test(name)) return false;
    return SUPPORTED_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function bump(folderId, patch) {
    const cur = status.get(folderId) || { imported: 0, error: null };
    status.set(folderId, { ...cur, ...patch });
    broadcast('watch:changed', { id: folderId });
}

// Waits until the file exists with the same non-zero size twice in a row.
function whenStable(file, startedAt = Date.now()) {
    return new Promise((resolve) => {
        const check = (prev) => {
            let st;
            try { st = fs.statSync(file); } catch { resolve(false); return; }
            if (!st.isFile()) { resolve(false); return; }
            const sig = `${st.size}:${st.mtimeMs}`;
            if (prev === sig && st.size > 0) { resolve(true); return; }
            if (Date.now() - startedAt > opts.maxWaitMs) { resolve(false); return; }
            setTimeout(() => check(sig), opts.stableMs);
        };
        check(null);
    });
}

function enqueue(folder, file) {
    queue = queue.then(async () => {
        if (!fs.existsSync(file)) return;
        try {
            const res = await importFile({
                filePath: file,
                collectionId: folder.collectionId || null,
                tags: folder.tags,
                origin: 'watch',
            });
            if (!res.skipped) {
                bump(folder.id, { imported: (status.get(folder.id)?.imported || 0) + 1, error: null });
                try { require('./tray').imported(`из «${path.basename(folder.path) || folder.path}»`); } catch { /* no tray (tests) */ }
            }
        } catch (e) {
            console.warn('[watch] import failed:', file, e.message);
        }
    });
    return queue;
}

// A file event: debounce per path, wait for the download to settle, import.
function consider(folder, file) {
    if (!isCandidate(file)) return;
    clearTimeout(pending.get(file));
    pending.set(file, setTimeout(async () => {
        pending.delete(file);
        if (await whenStable(file)) {
            await enqueue(folder, file);
            await touch(folder.id);
        }
    }, 300));
}

function listFiles(dir, recursive) {
    const out = [];
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (recursive) out.push(...listFiles(full, true)); }
        else if (isCandidate(full)) out.push(full);
    }
    return out;
}

async function touch(id, at = Date.now()) {
    await WatchedFolder.update({ lastScanAt: at }, { where: { id } });
}

// Files changed after `since` (ms); everything with since = 0.
async function scan(folder, since) {
    const startedAt = Date.now();
    const files = listFiles(folder.path, folder.recursive).filter(f => {
        try {
            const st = fs.statSync(f);
            // A copied-in file keeps its old mtime but gets a fresh birthtime.
            return Math.max(st.mtimeMs, st.birthtimeMs || 0) > since;
        } catch { return false; }
    });
    let imported = 0;
    for (const f of files) {
        if (!(await whenStable(f))) continue;
        const before = status.get(folder.id)?.imported || 0;
        await enqueue(folder, f);
        if ((status.get(folder.id)?.imported || 0) > before) imported++;
    }
    await touch(folder.id, startedAt);
    return { found: files.length, imported };
}

function watch(folder) {
    unwatch(folder.id);
    if (!folder.enabled) return;
    if (!fs.existsSync(folder.path)) { bump(folder.id, { error: 'Папка не найдена' }); return; }
    try {
        const w = fs.watch(folder.path, { recursive: folder.recursive }, (event, name) => {
            if (!name) return;
            consider(folder, path.join(folder.path, name.toString()));
        });
        w.on('error', (e) => { bump(folder.id, { error: e.message }); unwatch(folder.id); });
        watchers.set(folder.id, w);
        bump(folder.id, { error: null });
    } catch (e) {
        bump(folder.id, { error: e.message });
    }
}

function unwatch(id) {
    watchers.get(id)?.close();
    watchers.delete(id);
}

async function rows() {
    return (await WatchedFolder.findAll({ order: [['id', 'ASC']], raw: true })).map(toDto);
}

async function list() { return rows(); }

// Start watching every enabled folder and catch up on what came in meanwhile.
async function start() {
    running = true;
    for (const f of await rows()) {
        watch(f);
        if (f.enabled && watchers.has(f.id)) {
            scan(f, f.lastScanAt).catch(e => console.warn('[watch] catch-up failed:', f.path, e.message));
        }
    }
}

function stop() {
    running = false;
    [...watchers.keys()].forEach(unwatch);
    pending.forEach(clearTimeout);
    pending.clear();
}

async function save(data = {}) {
    const clean = {
        enabled: data.enabled !== false,
        recursive: data.recursive !== false,
        collectionId: data.collectionId || null,
        tags: JSON.stringify([...new Set((data.tags || []).map(t => String(t).trim().toLowerCase()).filter(Boolean))]),
    };
    let id = data.id;
    if (id) {
        await WatchedFolder.update(clean, { where: { id } });
    } else {
        const p = path.resolve(String(data.path || ''));
        if (!data.path || !fs.existsSync(p)) throw new Error('Папка не найдена');
        const existing = await WatchedFolder.findOne({ where: { path: p } });
        if (existing) throw new Error('Эта папка уже отслеживается');
        // New folders start from "now": what is already there is imported only on request.
        id = (await WatchedFolder.create({ ...clean, path: p, lastScanAt: Date.now(), createdAt: Math.floor(Date.now() / 1000) })).id;
    }
    if (running) {
        const row = (await rows()).find(r => r.id === id);
        if (row) watch(row);
    }
    return rows();
}

async function remove(id) {
    unwatch(id);
    status.delete(id);
    await WatchedFolder.destroy({ where: { id } });
    return rows();
}

// "Import what is already there": every file, not only the new ones.
async function importExisting(id) {
    const f = (await rows()).find(r => r.id === id);
    if (!f) return { found: 0, imported: 0 };
    return scan(f, 0);
}

module.exports = { list, save, remove, start, stop, importExisting, scan, opts, isCandidate };
