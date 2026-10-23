import {useEffect, useState} from 'react';

// Per-viewer gallery preferences (this device only), kept in localStorage.
const KEY = 'jsg_view_prefs';

const DEFAULTS = {
    ratingDividers: true,   // group the gallery under "★ N" headers when sorted by rating
    collapsedRatings: [],   // rating groups folded by clicking their header
    dateDividers: true,     // month headers when sorted by date
    typeDividers: true,     // "Images / GIF / Video / Manga" headers when sorted by type
    collapsedTypes: [],
    librarySort: null,      // { sortBy, order } — the last chosen order
    sortPerCollection: false,   // remember the order separately for each collection
    sortByCollection: {},   // collection id → { sortBy, order }
    filmstrip: true,        // thumbnail strip at the bottom of the viewer
    collapsedMonths: [],    // folded months ("2026-09")
    restoreSession: true,   // reopen the tab / collection / folder that was open last
    booruInfinite: true,    // booru results: endless scroll (off = page buttons)
    lastNav: 0,             // index of the top-bar tab
    lastCollection: null,   // library tree selection
};

let current = load();
const listeners = new Set();

function load() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { ...DEFAULTS }; }
}

export function getViewPrefs() { return current; }

export function setViewPref(name, value) {
    current = { ...current, [name]: value };
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
    listeners.forEach(fn => fn(current));
}

export function useViewPref(name) {
    const [value, setValue] = useState(current[name]);
    useEffect(() => {
        setValue(current[name]);   // the pref's name can change (e.g. which groups fold)
        const fn = (prefs) => setValue(prefs[name]);
        listeners.add(fn);
        return () => listeners.delete(fn);
    }, [name]);
    return [value, (v) => setViewPref(name, v)];
}
