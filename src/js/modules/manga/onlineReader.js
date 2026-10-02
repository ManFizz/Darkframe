import {mangaApi} from '@/Infrastructure/Ipc';
import {openReader} from '@react/Manga/readerStore';
import {notify} from '@services/NotificationService';
import {onlineHistory} from './onlineHistory';

export const errText = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

/**
 * Reads a gallery of an online source without saving it: pages come through the
 * page cache, chapters load when reached, the position is remembered per gallery.
 * `g` — the result of mangaApi.gallery(); `start` — { chapter, page } or null to
 * continue where reading stopped.
 */
export function readOnline(g, { start = null, onDownload = null } = {}) {
    const saved = onlineHistory.get(g.source, g.id);
    const chapters = g.chapters.map(c => ({ id: c.id, title: c.title, pages: c.pages }));
    if (!chapters.length) {
        notify({ message: 'У этой манги нет глав для чтения', type: 'warning' });
        return;
    }
    const resume = !start && saved && chapters.some(c => c.id === saved.chapter) ? { chapter: saved.chapter, page: saved.page || 0 } : null;
    onlineHistory.save(g.source, g.id, { title: g.title, cover: g.cover, url: g.url });
    openReader({
        key: `online:${g.source}:${g.id}:${Date.now()}`,
        title: g.title,
        chapters,
        loadChapter: (chapterId) => mangaApi.chapter(g.source, g.id, chapterId).catch(e => { throw new Error(errText(e)); }),
        start: start || resume || { chapter: chapters[0].id, page: 0 },
        reading: { ...(g.reading || {}), ...(saved?.reading || {}) },
        onProgress: (pos) => {
            const c = chapters.find(x => x.id === pos.chapter);
            onlineHistory.save(g.source, g.id, {
                chapter: pos.chapter, chapterTitle: c?.title || '', page: pos.page, chapters: chapters.length,
                chapterIndex: chapters.indexOf(c), pagesInChapter: null,
            });
        },
        onSaveReading: (reading) => onlineHistory.save(g.source, g.id, { reading }),
        actions: [
            ...(g.login ? [{ id: 'login', label: 'Войти', icon: 'bi-person-circle', run: () => mangaApi.login(g.source) }] : []),
            ...(onDownload ? [{ id: 'download', label: 'Скачать', icon: 'bi-download', run: () => onDownload() }] : []),
        ],
    });
}
