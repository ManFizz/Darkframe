import {useEffect, useState} from 'react';

// Per-viewer gallery preferences. Unlike data/settings they apply instantly —
// no save & relaunch — so they live in localStorage.
const KEY = 'jsg_view_prefs';

const DEFAULTS = {
    ratingDividers: true,   // group the gallery under "★ N" headers when sorted by rating
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
