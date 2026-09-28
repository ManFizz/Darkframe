import {useEffect, useState} from 'react';

// Per-viewer gallery preferences. Unlike data/settings they apply instantly —
// no save & relaunch — so they live in localStorage.
const KEY = 'jsg_view_prefs';

const DEFAULTS = {
    ratingDividers: true,   // group the gallery under "★ N" headers when sorted by rating
    collapsedRatings: [],   // rating groups folded by clicking their header
    dateDividers: true,     // month headers when sorted by date
    collapsedMonths: [],    // folded months ("2026-09")
    restoreSession: true,   // reopen the tab / collection / folder that was open last
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
        const fn = (prefs) => setValue(prefs[name]);
        listeners.add(fn);
        return () => listeners.delete(fn);
    }, [name]);
    return [value, (v) => setViewPref(name, v)];
}
