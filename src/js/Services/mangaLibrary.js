import {mangaApi} from '@/Infrastructure/Ipc';
import {notify} from './NotificationService';
import {openReader} from '@/React/Manga/readerStore';

// Page editor opener (the editor registers itself; see PageEditor.jsx).
let editorOpener = null;
export const registerPageEditor = (fn) => { editorOpener = fn; return () => { if (editorOpener === fn) editorOpener = null; }; };
export const openPageEditor = (item) => editorOpener?.(item);

const toChapters = (book) => book.chapters.map(c => ({ id: c.id, title: c.title, pages: c.pages }));

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
    const st = book.state;
    const resume = !fromStart && st && !st.finished && chapters.some(c => c.id === st.chapter);
    openReader({
        key: `lib:${item.id}:${Date.now()}`,
        title: item.title || 'Манга',
        chapters,
        start: resume ? { chapter: st.chapter, page: st.page } : { chapter: chapters[0]?.id, page: 0 },
        reading: book.reading,
        onProgress: (pos) => mangaApi.saveProgress(item.id, pos).catch(() => {}),
        onSaveReading: (reading) => mangaApi.setReading(item.id, reading).catch(() => {}),
        // The editor changes the book under the reader: close it first.
        actions: [{ id: 'pages', label: 'Страницы', icon: 'bi-grid-3x3', run: ({ close }) => { close(); openPageEditor(item); } }],
        // Tiles show the reading progress: refresh the open library view.
        onClose: () => window.dispatchEvent(new CustomEvent('df:libraryReload')),
    });
}
