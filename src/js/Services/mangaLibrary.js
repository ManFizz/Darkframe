import {mangaApi} from '@/Infrastructure/Ipc';
import {notify} from './NotificationService';
import {openReader} from '@/React/Manga/readerStore';

// Page editor opener (the editor registers itself; see PageEditor.jsx).
let editorOpener = null;
export const registerPageEditor = (fn) => { editorOpener = fn; return () => { if (editorOpener === fn) editorOpener = null; }; };
export const openPageEditor = (item) => editorOpener?.(item);

const errText = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// Chapters still on the site come without pages: the reader loads them when reached.
const toChapters = (book) => book.chapters.map(c => ({ id: c.id, title: c.title, pages: c.remote ? null : c.pages, src: c.src, remote: !!c.remote }));

// Pages of a chapter not loaded yet are guessed from the ones known (for the
// position across the whole manga: tile bars, "finished").
function positionOf(chapters, counts, pos) {
    const known = chapters.map(c => counts.get(c.id) ?? c.pages?.length).filter(n => n > 0);
    const guess = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : 20;
    const sizes = chapters.map(c => counts.get(c.id) ?? c.pages?.length ?? guess);
    const ci = chapters.findIndex(c => c.id === pos.chapter);
    const before = sizes.slice(0, Math.max(0, ci)).reduce((a, b) => a + b, 0);
    return { ...pos, position: before + pos.page, total: sizes.reduce((a, b) => a + b, 0) };
}

/**
 * Opens a library manga in the reader, at the page where reading stopped.
 * `item` — a ThumbFile / item row with id + title.
 */
export async function readLibraryManga(item, { fromStart = false } = {}) {
    let book;
    try {
        book = await mangaApi.book(item.id);
    } catch (e) {
        notify({ message: `Не удалось открыть: ${e.message}`, type: 'warning' });
        return;
    }
    const chapters = toChapters(book);
    const site = book.source?.kind === 'online' ? book.source : null;
    const remote = chapters.filter(c => c.remote);
    const counts = new Map();
    const st = book.state;
    const resume = !fromStart && st && !st.finished && chapters.some(c => c.id === st.chapter);
    if (book.subscription?.unseen) mangaApi.setSeen(item.id).catch(() => {});
    openReader({
        key: `lib:${item.id}:${Date.now()}`,
        title: item.title || 'Манга',
        chapters,
        // Online chapters: straight from the site, through the page cache.
        loadChapter: site && remote.length ? (chapterId) => {
            const c = chapters.find(x => x.id === chapterId);
            return mangaApi.chapter(site.site, site.id, c.src)
                .then(pages => { counts.set(chapterId, pages.length); return pages; })
                .catch(e => { throw new Error(errText(e)); });
        } : undefined,
        start: resume ? { chapter: st.chapter, page: st.page } : { chapter: chapters[0]?.id, page: 0 },
        reading: book.reading || null,
        // Pages carry their sizes here: webtoon strips are recognised by them.
        onProgress: (pos) => mangaApi.saveProgress(item.id, remote.length ? positionOf(chapters, counts, pos) : pos).catch(() => {}),
        savePage: (p, { page, chapterTitle }) => (p.file
            ? mangaApi.savePage({ itemId: item.id, file: p.file, page, chapterTitle })
            : mangaApi.savePage({ source: site.site, url: p.src, resolve: p.resolve, page, chapterTitle, title: item.title, sourceUrl: item.sourceUrl || '' })),
        actions: [
            ...(remote.length ? [{
                id: 'download', label: `Скачать онлайн-главы (${remote.length})`, icon: 'bi-download',
                run: () => mangaApi.downloadRemote(item.id)
                    .then(r => r && notify({ message: `Главы (${remote.length}) в очереди загрузки — допишутся в эту мангу`, type: 'success' }))
                    .catch(e => notify({ message: errText(e), type: 'warning' })),
            }] : []),
            // The editor changes the book under the reader: close it first.
            ...(chapters.some(c => c.pages?.length) ? [{ id: 'pages', label: 'Страницы', icon: 'bi-grid-3x3', run: ({ close }) => { close(); openPageEditor(item); } }] : []),
        ],
        // Tiles show the reading progress: refresh the open library view.
        onClose: () => window.dispatchEvent(new CustomEvent('df:libraryReload')),
    });
}
