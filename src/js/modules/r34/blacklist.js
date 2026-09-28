import {useEffect, useState} from 'react';

// Per-source tag blacklist. Hiding happens on the client, after the API answers —
// the query stays untouched (booru APIs cap the number of tags per query).
// "Show hidden" is a session-only switch.
const KEY = 'jsg_booru_blacklist';

let lists = load();
let showHidden = false;
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn());

function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(lists)); } catch { /* ignore */ }
    emit();
}

const norm = (t) => String(t || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/^-/, '');

export const getBlacklist = (source) => lists[source] || [];

export function addToBlacklist(source, tags) {
    const add = (Array.isArray(tags) ? tags : [tags]).map(norm).filter(Boolean);
    lists = { ...lists, [source]: [...new Set([...getBlacklist(source), ...add])] };
    persist();
}

export function removeFromBlacklist(source, tag) {
    lists = { ...lists, [source]: getBlacklist(source).filter(t => t !== tag) };
    persist();
}

export function setShowHidden(v) { showHidden = v; emit(); }

// How many loaded posts the blacklist hides right now (set by the gallery).
let hiddenCount = 0;
export function setHiddenCount(n) {
    if (n === hiddenCount) return;
    hiddenCount = n;
    emit();
}

// The blacklisted tag that hides this post (or null).
export function blockedBy(file, list) {
    if (!list.length || !file.tags?.length) return null;
    const set = file.tags;
    return list.find(t => set.includes(t)) || null;
}

export function useBlacklist(source) {
    const [, force] = useState(0);
    useEffect(() => {
        const fn = () => force(v => v + 1);
        listeners.add(fn);
        return () => listeners.delete(fn);
    }, []);
    return { list: getBlacklist(source), showHidden, hiddenCount };
}
