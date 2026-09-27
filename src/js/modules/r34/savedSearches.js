import {useEffect, useState} from 'react';
import {savedSearchesApi} from '@/Infrastructure/Ipc';

// Remembered booru searches (per source), kept in the DB by the main process.
// Rows: { id, source, tags: "a -b", minScore, sort, rating, key, title, position,
//         createdAt, lastTotal, lastOpenedAt }.
let rows = [];
let loaded = false;
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn(rows));
const apply = (list) => { if (Array.isArray(list)) { rows = list; emit(); } return rows; };

export async function loadSavedSearches() {
    loaded = true;
    return apply(await savedSearchesApi.list());
}

export const tagsOf = (row) => String(row.tags || '').split(' ').filter(Boolean);
export const queryOf = (row) => ({ tags: tagsOf(row), minScore: row.minScore, sort: row.sort, rating: row.rating });

export async function saveSearch(source, query, title) {
    const res = await savedSearchesApi.add(source, query, title);
    apply(res?.list);
    return res;
}

export async function removeSearch(id) { return apply(await savedSearchesApi.remove(id)); }
export async function restoreSearch(row) { return apply(await savedSearchesApi.restore(row)); }
export async function updateSearch(id, patch) { return apply(await savedSearchesApi.update(id, patch)); }

export async function reorderSearches(source, ids) {
    const pos = new Map(ids.map((id, i) => [id, i]));
    rows = [...rows].sort((a, b) =>
        a.source === source && b.source === source ? pos.get(a.id) - pos.get(b.id) : 0);   // optimistic
    emit();
    return apply(await savedSearchesApi.reorder(source, ids));
}

export function useSavedSearches(source) {
    const [list, setList] = useState(rows);
    useEffect(() => {
        listeners.add(setList);
        if (!loaded) loadSavedSearches().catch(() => {});
        return () => listeners.delete(setList);
    }, []);
    return source == null ? list : list.filter(r => r.source === source);
}
