import {mangaApi} from '@/Infrastructure/Ipc';
import {openReader} from '@react/Manga/readerStore';
import {notify} from '@services/NotificationService';
import {onlineHistory} from './onlineHistory';

// The site's sign-in window; says afterwards whether the sign-in took.
export async function loginTo(source) {
    try {
        const r = await mangaApi.login(source);
        if (r?.loggedIn) notify({ message: 'Вход выполнен — главы теперь открываются', type: 'success' });
        else if (r?.loggedIn === false) notify({ message: 'Вход не обнаружен. Если вы входили — откройте «Войти» ещё раз и дождитесь, пока окно вернётся на сайт', type: 'warning', duration: 9000 });
        return !!r?.loggedIn;
    } catch (e) {
        notify({ message: errText(e), type: 'warning' });
        return false;
    }
}

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
        reading: g.reading || null,   // the site may mark a title as a webtoon
        onProgress: (pos) => {
            const c = chapters.find(x => x.id === pos.chapter);
            onlineHistory.save(g.source, g.id, {
                chapter: pos.chapter, chapterTitle: c?.title || '', page: pos.page, chapters: chapters.length,
                chapterIndex: chapters.indexOf(c), pagesInChapter: null,
            });
        },
        savePage: (p, { page, chapterTitle }) => mangaApi.savePage({
            source: g.source, url: p.src, resolve: p.resolve, page, chapterTitle,
            title: g.title, tags: g.tags || [], sourceUrl: g.url,
        }),
        actions: [
            ...(g.login ? [{ id: 'login', label: 'Войти', icon: 'bi-person-circle', run: () => loginTo(g.source) }] : []),
            ...(onDownload ? [{ id: 'download', label: 'Скачать', icon: 'bi-download', run: () => onDownload() }] : []),
        ],
    });
}
