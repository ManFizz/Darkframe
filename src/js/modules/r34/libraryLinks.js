import {useEffect, useState} from 'react';
import {libraryApi} from '@/Infrastructure/Ipc';
import LibraryService from '@services/LibraryService';

// Which booru posts are already in the library, matched by the post link saved as
// the item's sourceUrl. Links are compared by host + post id, so the API link
// (dapi) and the page link of the same post match.
let keys = new Set();
let loaded = false;
let loading = null;
const listeners = new Set();

export function postKey(url) {
    if (!url) return null;
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^(www|api)\./, '');
        const id = u.searchParams.get('id') || u.pathname.match(/\/posts\/(\d+)/)?.[1];
        return id ? `${host}#${id}` : `${host}${u.pathname}${u.search}`.toLowerCase();
    } catch {
        return String(url).toLowerCase();
    }
}

function refresh() {
    if (loading) return loading;
    loading = libraryApi.sourceUrls()
        .then(urls => {
            keys = new Set(urls.map(postKey).filter(Boolean));
            loaded = true;
            listeners.forEach(fn => fn(keys));
        })
        .catch(() => {})
        .finally(() => { loading = null; });
    return loading;
}

LibraryService.onLibraryChanged(() => { if (loaded) refresh(); });

// Optimistic mark right after a save, before the change event round-trips.
export function markInLibrary(url) {
    const k = postKey(url);
    if (!k || keys.has(k)) return;
    keys = new Set(keys).add(k);
    listeners.forEach(fn => fn(keys));
}

export function useLibraryLinks() {
    const [set, setSet] = useState(keys);
    useEffect(() => {
        listeners.add(setSet);
        if (!loaded) refresh();
        return () => listeners.delete(setSet);
    }, []);
    return set;
}
