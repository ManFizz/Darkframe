import {useEffect, useRef, useState} from 'react';
import {libraryApi} from '@/Infrastructure/Ipc';
import {mediaKey} from '@services/mediaKey';

// "Hide viewed" for the booru sources: posts already opened in the viewer (by the
// view history, which is kept until cleared by hand) drop out of the results.
// The switch is per source and remembered; hiding happens on the client.
const KEY = 'jsg_booru_hide_viewed';

let on = load();
let hiddenCount = 0;
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn());

function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export const isHidingViewed = (source) => !!on[source];

export function setHideViewed(source, value) {
    on = { ...on, [source]: !!value };
    try { localStorage.setItem(KEY, JSON.stringify(on)); } catch { /* ignore */ }
    emit();
}

// How many loaded posts are hidden as viewed (set by the gallery).
export function setViewedHiddenCount(n) {
    if (n === hiddenCount) return;
    hiddenCount = n;
    emit();
}

export function useHideViewed(source) {
    const [, force] = useState(0);
    useEffect(() => {
        const fn = () => force(v => v + 1);
        listeners.add(fn);
        return () => listeners.delete(fn);
    }, []);
    return { on: isHidingViewed(source), hiddenCount };
}

/**
 * Keys (see mediaKey) of the `files` that were viewed. Looked up only for files not
 * asked about yet, and not while `frozen` (the viewer is open: hiding posts under
 * it would break its paging) — what was viewed meanwhile shows up once it closes.
 */
export function useViewedKeys(files, enabled, frozen) {
    const [seen, setSeen] = useState(() => new Set());
    const asked = useRef(new Set());
    const [closedAt, setClosedAt] = useState(0);

    // Every close of the viewer: ask again about what's loaded.
    const wasFrozen = useRef(frozen);
    useEffect(() => {
        if (wasFrozen.current && !frozen) { asked.current = new Set(); setClosedAt(Date.now()); }
        wasFrozen.current = frozen;
    }, [frozen]);

    useEffect(() => {
        if (!enabled || frozen || !files.length) return;
        const bySection = new Map();
        for (const f of files) {
            const mk = mediaKey(f);
            if (!mk || asked.current.has(mk.key)) continue;
            asked.current.add(mk.key);
            if (!bySection.has(mk.section)) bySection.set(mk.section, []);
            bySection.get(mk.section).push(mk.key);
        }
        if (!bySection.size) return;
        // Not cancelled on a re-run: these keys count as asked, so their answer must land.
        Promise.all([...bySection].map(([section, keys]) => libraryApi.viewedKeys({ section, keys }).catch(() => [])))
            .then(lists => {
                const found = lists.flat();
                if (found.length) setSeen(prev => new Set([...prev, ...found]));
            });
    }, [files, enabled, frozen, closedAt]);

    return seen;
}

export const viewedKeyOf = (file) => mediaKey(file)?.key;
