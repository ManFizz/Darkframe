import {useEffect, useRef} from 'react';

/**
 * Command registry for the Ctrl+K palette. Components register what they can do
 * while they are mounted:
 *   useCommands('library', () => [{ id, title, group, icon, keywords, hint, run }])
 * or a provider that builds commands from the typed text:
 *   useCommandProvider('booru-search', (query) => [...])
 *
 * Cross-view requests ("open collection X" while Folders is shown) go through
 * request/take pairs: the command switches the tab and parks the target; the view
 * picks it up on mount or, if already mounted, through its subscription.
 */
const sources = new Map();     // key → () => Command[]
const providers = new Map();   // key → (query) => Command[]

export function getCommands(query) {
    const out = [];
    sources.forEach(fn => { try { out.push(...(fn() || [])); } catch (e) { console.warn('[commands]', e); } });
    providers.forEach(fn => { try { out.push(...(fn(query) || [])); } catch (e) { console.warn('[commands]', e); } });
    return out;
}

// `build` is read when the palette opens, so it always sees the latest state.
export function useCommands(key, build) {
    const ref = useRef(build);
    ref.current = build;
    useEffect(() => {
        sources.set(key, () => ref.current());
        return () => sources.delete(key);
    }, [key]);
}

export function useCommandProvider(key, build) {
    const ref = useRef(build);
    ref.current = build;
    useEffect(() => {
        providers.set(key, (q) => ref.current(q));
        return () => providers.delete(key);
    }, [key]);
}

function channel() {
    let pending = null;
    const listeners = new Set();
    return {
        request(value) {
            pending = value;
            listeners.forEach(fn => fn(value));
        },
        take() {
            const v = pending;
            pending = null;
            return v;
        },
        subscribe(fn) {
            const wrapped = (v) => { pending = null; fn(v); };
            listeners.add(wrapped);
            return () => listeners.delete(wrapped);
        },
    };
}

export const collectionRequests = channel();   // library collection id
export const folderRequests = channel();       // folder path
export const mangaRequests = channel();        // { view: 'downloads' | 'search' | 'recent', source?, query?, open? }

// Ranking: every word must appear in title / group / keywords; title prefix and
// word-start matches rank first.
export function matchCommands(list, query) {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return list;
    const scored = [];
    list.forEach(c => {
        const title = c.title.toLowerCase();
        const hay = `${title} ${(c.group || '').toLowerCase()} ${(c.keywords || '').toLowerCase()}`;
        if (c.always) { scored.push({ c, s: -1 }); return; }
        if (!words.every(w => hay.includes(w))) return;
        let s = 0;
        words.forEach(w => {
            if (title.startsWith(w)) s += 3;
            else if (title.includes(` ${w}`) || title.includes(`: ${w}`)) s += 2;
            else if (title.includes(w)) s += 1;
        });
        scored.push({ c, s });
    });
    return scored.sort((a, b) => b.s - a.s).map(x => x.c);
}
