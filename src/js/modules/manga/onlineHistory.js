/**
 * Online manga read without saving: where reading stopped in each gallery (per
 * viewer, localStorage). Library manga keep it in the DB.
 */
const KEY = 'jsg_manga_online';
const MAX = 300;
const listeners = new Set();

const keyOf = (source, id) => `${source}:${id}`;

function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; }
    catch { return []; }
}

function store(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* full */ }
    listeners.forEach(fn => fn());
}

export const onlineHistory = {
    list: load,
    get: (source, id) => load().find(e => e.key === keyOf(source, id)) || null,
    // Moves the gallery to the top; `patch`: title, cover, chapter, chapterTitle, page, position, total, reading
    save(source, id, patch) {
        const list = load();
        const i = list.findIndex(e => e.key === keyOf(source, id));
        const cur = i >= 0 ? list.splice(i, 1)[0] : { key: keyOf(source, id), source, id };
        const next = { ...cur, ...patch, reading: { ...(cur.reading || {}), ...(patch.reading || {}) }, at: Date.now() };
        store([next, ...list]);
        return next;
    },
    remove(key) { store(load().filter(e => e.key !== key)); },
    clear() { store([]); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
