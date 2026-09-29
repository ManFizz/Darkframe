import {useEffect, useState} from 'react';
import {libraryApi} from '@/Infrastructure/Ipc';
import {notify} from './NotificationService';
import {collectionRequests} from './commands';

/**
 * Search by picture (perceptual hash): the query is a library item, the clipboard
 * image or a file picked from disk. Results open as a special library view
 * (SPECIAL.VISUAL); the strictness slider re-runs the same query by its hash.
 */
export const VISUAL = 'VISUAL';

let state = { query: null, results: [], unhashed: 0, maxDistance: 14, loading: false };
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach(fn => fn(state)); };

export const getVisualSearch = () => state;

export function useVisualSearch() {
    const [s, setS] = useState(state);
    useEffect(() => { listeners.add(setS); return () => listeners.delete(setS); }, []);
    return s;
}

// query: { id, label, preview } | { clipboard: true } | { pick: true }
export async function runVisualSearch(query, maxDistance = state.maxDistance) {
    set({ loading: true });
    let res;
    try {
        res = await libraryApi.visualSearch({ ...query, maxDistance });
    } catch (e) {
        res = { error: e.message };
    }
    if (!res || res.canceled) { set({ loading: false }); return false; }
    if (res.error) {
        set({ loading: false });
        notify({ message: res.error, type: 'warning' });
        return false;
    }
    set({
        loading: false,
        query: {
            hash: res.hash,
            label: query.label || (query.clipboard ? 'картинка из буфера обмена' : res.fileName || 'выбранная картинка'),
            preview: query.preview || res.preview || null,
            id: query.id || null,
        },
        results: res.results,
        unhashed: res.unhashed,
        maxDistance: res.maxDistance,
    });
    collectionRequests.request(VISUAL);
    return true;
}

export async function rerunVisualSearch(maxDistance) {
    if (!state.query?.hash) return;
    set({ maxDistance, loading: true });
    const res = await libraryApi.visualSearch({ hash: state.query.hash, maxDistance }).catch(e => ({ error: e.message }));
    if (res.error) { set({ loading: false }); notify({ message: res.error, type: 'warning' }); return; }
    set({ loading: false, results: res.results, unhashed: res.unhashed, maxDistance: res.maxDistance });
}
