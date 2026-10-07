import {useEffect, useState} from 'react';
import {mangaApi} from '@/Infrastructure/Ipc';
import {notify} from '@services/NotificationService';
import {readLibraryManga} from '@services/mangaLibrary';
import {openManga} from './openManga';

// The download queue, live (the main process broadcasts every change).
export function useMangaDownloads() {
    const [jobs, setJobs] = useState([]);
    useEffect(() => {
        let alive = true;
        mangaApi.downloads().then(l => { if (alive) setJobs(l); }).catch(() => {});
        const off = mangaApi.onDownloads(l => setJobs(l));
        return () => { alive = false; off(); };
    }, []);
    return jobs;
}

/**
 * Mounted once (AppInitializer): a notice when a download finishes or fails,
 * whatever tab is open; the library view reloads to show the new manga.
 */
export const MangaDownloadsWatcher = () => {
    useEffect(() => {
        let last = null;   // id → status
        const seed = (list) => { last = new Map(list.map(j => [j.id, j.status])); };
        mangaApi.downloads().then(seed).catch(() => seed([]));
        return mangaApi.onDownloads((list) => {
            if (!last) { seed(list); return; }
            list.forEach(j => {
                const before = last.get(j.id);
                if (before === j.status || !before || before === 'done') return;
                if (j.status === 'done' && j.itemId) {
                    notify({
                        message: j.error ? `«${j.title || 'Манга'}» уже была в библиотеке` : `Скачано: «${j.title || 'Манга'}» · ${j.total} стр.`,
                        type: 'success',
                        duration: 7000,
                        action: { label: 'Читать', onClick: () => readLibraryManga({ id: j.itemId, title: j.title }) },
                    });
                    window.dispatchEvent(new CustomEvent('df:libraryReload'));
                } else if (j.status === 'error') {
                    notify({
                        message: `Не скачалось «${j.title || j.galleryId}»: ${j.error || 'ошибка'}`,
                        type: 'warning',
                        duration: 9000,
                        action: { label: 'Загрузки', onClick: () => openManga({ view: 'downloads' }) },
                    });
                }
            });
            seed(list);
        });
    }, []);
    // Subscriptions checked on schedule: what came out.
    useEffect(() => mangaApi.onUpdates((r) => {
        if (r?.reason !== 'schedule' || !r.items?.length) return;
        const one = r.items.length === 1 ? r.items[0] : null;
        const names = r.items.slice(0, 3).map(i => `«${i.title}» +${i.added}`).join(', ');
        notify({
            message: `Новые главы: ${names}${r.items.length > 3 ? ` и ещё ${r.items.length - 3}` : ''}`,
            type: 'success',
            duration: 10000,
            action: one
                ? { label: 'Читать', onClick: () => readLibraryManga({ id: one.id, title: one.title }) }
                : { label: 'Подписки', onClick: () => openManga({ view: 'subs' }) },
        });
    }), []);
    return null;
};
