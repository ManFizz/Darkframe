import {useCallback, useEffect, useRef, useState} from 'react';
import {fsApi, fsThumbUrl} from '@/Infrastructure/Ipc';
import {ThumbFile} from '@/Models/ThumbFile';
import {FILE_TYPES, SOURCE_TYPES} from '@/Constants';
import {rememberVisit} from './folderPrefs';
import {fileUrl} from '@/Infrastructure/electron';


// Listing entry → ThumbFile the gallery and the viewer understand. The grid shows a
// cached fsthumb:// thumbnail; the viewer loads the real file.
export function toThumbFile(f) {
    return new ThumbFile({
        remoteId:   f.path,
        filePath:   f.path,
        title:      f.name,
        fileName:   f.name,
        thumbUrl:   fsThumbUrl(f.path),
        contentUrl: fileUrl(f.path),
        type:       f.kind === 'video' ? FILE_TYPES.VIDEO : FILE_TYPES.IMAGE,
        mimeType:   f.kind === 'gif' ? 'image/gif' : f.kind === 'video' ? `video/${f.ext}` : `image/${f.ext}`,
        remoteType: SOURCE_TYPES.FOLDER,
        size:       f.size,
        time:       Math.floor(f.mtime / 1000),
        createdAt:  Math.floor(f.ctime / 1000),
    });
}

/**
 * Current folder, its listing and browser-style history (back / forward / up).
 */
export function useFolderBrowser(initialPath) {
    const [path, setPath]       = useState(null);
    const [listing, setListing] = useState(null);   // { folders, files, stats, parent }
    const [error, setError]     = useState(null);
    const [loading, setLoading] = useState(false);
    const [nav, setNav]         = useState({ back: [], forward: [] });
    const reqId = useRef(0);

    const load = useCallback(async (target, mode = 'push') => {
        if (!target) return;
        const id = ++reqId.current;
        setLoading(true);
        const res = await fsApi.list(target);
        if (id !== reqId.current) return;              // a newer navigation won
        setLoading(false);

        if (!res?.ok) {
            setError({ path: target, message: res?.error || 'Не удалось открыть папку' });
            return;
        }
        setError(null);
        setNav(prev => {
            if (mode === 'push' && path && path !== res.path) return { back: [...prev.back, path], forward: [] };
            return prev;
        });
        setPath(res.path);
        setListing({ ...res, files: res.files.map(f => ({ ...f, thumb: toThumbFile(f) })) });
        rememberVisit(res.path);
    }, [path]);

    useEffect(() => { if (initialPath) load(initialPath, 'replace'); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

    const back = useCallback(() => {
        setNav(prev => {
            if (!prev.back.length) return prev;
            const target = prev.back[prev.back.length - 1];
            load(target, 'history');
            return { back: prev.back.slice(0, -1), forward: [path, ...prev.forward] };
        });
    }, [load, path]);

    const forward = useCallback(() => {
        setNav(prev => {
            if (!prev.forward.length) return prev;
            const [target, ...rest] = prev.forward;
            load(target, 'history');
            return { back: [...prev.back, path], forward: rest };
        });
    }, [load, path]);

    const up = useCallback(() => { if (listing?.parent) load(listing.parent); }, [listing, load]);
    const refresh = useCallback(() => { if (path) load(path, 'replace'); }, [path, load]);

    return {
        path, listing, error, loading,
        open: load, back, forward, up, refresh,
        canBack: nav.back.length > 0,
        canForward: nav.forward.length > 0,
        canUp: !!listing?.parent,
    };
}
