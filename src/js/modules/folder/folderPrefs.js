import {useEffect, useState} from 'react';

// Folders-browser preferences (per viewer, instant): pinned + recent folders, the
// last opened one, sorting, type filter and tile size.
const KEY = 'jsg_folder_prefs';
const RECENT_LIMIT = 8;

const DEFAULTS = {
    pinned: [],              // [{ path, name }]
    recent: [],              // [path] newest first
    lastPath: null,
    sortBy: 'name',          // name | mtime | size | type
    sortDir: 1,              // 1 asc, -1 desc
    kind: 'all',             // all | image | video | gif
    tile: 190,               // tile width, px
};

let current = load();
const listeners = new Set();

function load() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { ...DEFAULTS }; }
}

function save(patch) {
    current = { ...current, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private mode */ }
    listeners.forEach(fn => fn(current));
}

export const getFolderPrefs = () => current;
export const setFolderPrefs = (patch) => save(patch);

export const baseName = (p) => {
    const parts = String(p).replace(/[\\/]+$/, '').split(/[\\/]/);
    return parts[parts.length - 1] || p;
};

const samePath = (a, b) => String(a).replace(/[\\/]+$/, '').toLowerCase() === String(b).replace(/[\\/]+$/, '').toLowerCase();

export function rememberVisit(path) {
    const recent = [path, ...current.recent.filter(p => !samePath(p, path))].slice(0, RECENT_LIMIT);
    save({ recent, lastPath: path });
}

export function forgetRecent(path) {
    save({ recent: current.recent.filter(p => !samePath(p, path)) });
}

export const isPinned = (path) => current.pinned.some(p => samePath(p.path, path));

export function togglePin(path) {
    save({
        pinned: isPinned(path)
            ? current.pinned.filter(p => !samePath(p.path, path))
            : [...current.pinned, { path, name: baseName(path) }],
    });
}

export function useFolderPrefs() {
    const [prefs, setPrefs] = useState(current);
    useEffect(() => {
        listeners.add(setPrefs);
        return () => listeners.delete(setPrefs);
    }, []);
    return prefs;
}
