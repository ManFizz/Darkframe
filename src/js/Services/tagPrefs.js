import {useEffect, useState} from 'react';
import {libraryApi} from '@/Infrastructure/Ipc';

// Tag preferences for pickers and filters:
//   pinned   — chosen in the Tag Manager, stored in the DB (per library)
//   frequent — how often *you* add a tag (not how many files have it), kept locally
// Pinned tags come first everywhere, then the frequent ones.

const USAGE_KEY  = 'jsg_tag_usage';     // { [name]: { n: count, t: lastUsedMs } }
const LEGACY_KEY = 'jsg_recent_tags';   // old most-recently-used list — seeds usage once

let pinned = null;                     // [{ id, name, type }]
const listeners = new Set();
const emit = () => listeners.forEach(cb => cb());

function loadUsage() {
    try {
        const raw = localStorage.getItem(USAGE_KEY);
        if (raw) return JSON.parse(raw) || {};
        // First run: carry the previous "recent tags" over so nothing is lost.
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
        const now = Date.now();
        const seeded = {};
        legacy.forEach((name, i) => { seeded[name] = { n: 1, t: now - i }; });
        return seeded;
    } catch { return {}; }
}

function saveUsage(u) {
    try { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); } catch { /* ignore */ }
}

/** Count one "add" for each of these tag names. */
export function recordTagUse(names) {
    const list = (Array.isArray(names) ? names : [names]).filter(Boolean);
    if (!list.length) return;
    const u = loadUsage();
    const now = Date.now();
    for (const name of list) u[name] = { n: (u[name]?.n || 0) + 1, t: now };

    // Keep the store bounded: drop the least useful beyond 500 names.
    const known = Object.keys(u);
    if (known.length > 500) {
        known.sort((a, b) => (u[a].n - u[b].n) || (u[a].t - u[b].t));
        known.slice(0, known.length - 500).forEach(n => delete u[n]);
    }
    saveUsage(u);
    emit();
}

/** Most-added tag names, excluding `exclude` (e.g. pinned / already present). */
export function frequentTags(limit = 10, exclude = []) {
    const skip = new Set(exclude);
    const u = loadUsage();
    return Object.keys(u)
        .filter(n => !skip.has(n))
        .sort((a, b) => (u[b].n - u[a].n) || (u[b].t - u[a].t))
        .slice(0, limit);
}

export async function loadPinned(force = false) {
    if (pinned && !force) return pinned;
    try { pinned = await libraryApi.getPinnedTags(); }
    catch { pinned = pinned || []; }
    emit();
    return pinned;
}

export function getPinned() { return pinned || []; }

export async function setTagPinned(id, value) {
    await libraryApi.setTagPinned({ id, pinned: value });
    await loadPinned(true);
}

export function subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

/** Re-renders on pin / usage changes; returns { pinned: [names], frequent(limit, exclude) }. */
export function useTagPrefs() {
    const [, setVersion] = useState(0);
    useEffect(() => {
        const off = subscribe(() => setVersion(v => v + 1));
        loadPinned();
        return off;
    }, []);
    return {
        pinned: getPinned().map(t => t.name),
        frequent: frequentTags,
    };
}
