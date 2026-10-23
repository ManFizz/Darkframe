import {useEffect, useState} from 'react';
import {SearchMedia, getSearchStatus, subscribeSearchStatus, currentR34Source} from './R34Controller';
import {AppController} from '@controllers/AppInitializerController';

// Structured booru query shared by the top search bar and the sidebar:
//   tags     — ['cat', '-dog'] ("-" = exclude)
//   minScore — score:>=N (0 = off)
//   sort     — 'new' | 'score' | 'random'
//   rating   — 'any' | 'safe' | 'questionable' | 'explicit'
// Plus a per-source search history (localStorage).
const HISTORY_KEY = 'jsg_booru_history';
const HISTORY_LIMIT = 12;

// view: 'search' (results grid) | 'saved' (saved searches page) | 'favtags' (favourite tags page)
const state = { tags: [], minScore: 0, sort: 'new', rating: 'any', view: 'search' };
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn({ ...state, tags: [...state.tags] }));

export const normTag = (t) => String(t || '').trim().toLowerCase().replace(/\s+/g, '_');
const bare = (t) => t.replace(/^-/, '');

export function getQuery() { return { ...state, tags: [...state.tags] }; }

export function setQuery(patch) {
    Object.assign(state, patch);
    emit();
}

export function addTag(tag, { exclude = false } = {}) {
    const t = normTag(tag);
    if (!t) return;
    const name = bare(t);
    const full = exclude || t.startsWith('-') ? `-${name}` : name;
    state.tags = [...state.tags.filter(x => bare(x) !== name), full];
    emit();
}

export function removeTag(tag) {
    state.tags = state.tags.filter(x => x !== tag);
    emit();
}

// cat → -cat → (removed)
export function cycleTag(tag) {
    const name = bare(normTag(tag));
    const cur = state.tags.find(x => bare(x) === name);
    if (!cur) state.tags = [...state.tags, name];
    else if (!cur.startsWith('-')) state.tags = state.tags.map(x => (x === cur ? `-${name}` : x));
    else state.tags = state.tags.filter(x => x !== cur);
    emit();
}

export function toggleExclude(tag) {
    state.tags = state.tags.map(x => (x === tag ? (x.startsWith('-') ? bare(x) : `-${x}`) : x));
    emit();
}

export function tagState(tag) {
    const name = bare(normTag(tag));
    const cur = state.tags.find(x => bare(x) === name);
    return !cur ? null : cur.startsWith('-') ? 'exclude' : 'include';
}

// Query string for the booru API.
export function buildQueryString(q = state) {
    const parts = [...q.tags];
    if (q.minScore > 0) parts.push(`score:>=${q.minScore}`);
    if (q.sort === 'score') parts.push('sort:score:desc');
    if (q.sort === 'random') parts.push('sort:random');
    if (q.rating !== 'any') parts.push(`rating:${q.rating}`);
    return parts.join(' ');
}

function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}'); } catch { return {}; }
}

export function getHistory(source) {
    return loadHistory()[source] || [];
}

function pushHistory(source, tags) {
    if (!tags.length) return;
    const all = loadHistory();
    const key = tags.join(' ');
    const list = (all[source] || []).filter(h => h.tags.join(' ') !== key);
    all[source] = [{ tags, at: Date.now() }, ...list].slice(0, HISTORY_LIMIT);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(all)); } catch { /* ignore */ }
    emit();
}

export function clearHistory(source) {
    const all = loadHistory();
    delete all[source];
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(all)); } catch { /* ignore */ }
    emit();
}

// Same canonical form the main process uses for saved searches (see savedSearches.js).
export function queryKey(q = state) {
    const tags = [...new Set(q.tags.map(t => t.toLowerCase()))].sort().join(' ');
    return [tags, Math.max(0, Math.round(q.minScore || 0)), q.sort, q.rating].join('|');
}

export function setView(view) {
    state.view = view;
    emit();
}

// Runs the current (optionally patched) query and shows the results grid. With
// `openRemoteId`, the viewer opens on that post once the first page is in.
export async function runSearch(patch, { openRemoteId } = {}) {
    if (patch) Object.assign(state, patch);
    state.view = 'search';
    emit();
    if (!currentR34Source) return;
    pushHistory(currentR34Source.remoteType, state.tags);
    const posts = await SearchMedia(buildQueryString());
    if (openRemoteId && posts) {
        const hit = posts.find(p => String(p.remoteId) === String(openRemoteId));
        if (hit) AppController.openModal?.(hit);
    }
    return posts;
}

export function useBooruQuery() {
    const [q, setQ] = useState(getQuery);
    useEffect(() => {
        listeners.add(setQ);
        return () => listeners.delete(setQ);
    }, []);
    return q;
}

export function useSearchStatus() {
    const [s, setS] = useState(getSearchStatus);
    useEffect(() => subscribeSearchStatus(setS), []);
    return s;
}
