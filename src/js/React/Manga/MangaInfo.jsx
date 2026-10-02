import React, {useEffect, useState} from 'react';
import {mangaApi} from '@/Infrastructure/Ipc';
import {notify} from '@services/NotificationService';
import {openPageEditor, readLibraryManga} from '@services/mangaLibrary';

const errText = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// Manga block of the library side panel: read / continue, pages, export, split.
const MangaInfo = ({ file, onChanged }) => {
    const [book, setBook] = useState(null);
    const [busy, setBusy] = useState(null);

    useEffect(() => {
        let cancelled = false;
        mangaApi.book(file.id).then(b => { if (!cancelled) setBook(b); }).catch(() => {});
        return () => { cancelled = true; };
    }, [file.id, file.pageCount, file.editedAt]);

    const pages = book ? book.chapters.reduce((n, c) => n + c.pages.length, 0) : file.pageCount;
    const st = book?.state;
    const started = st && !st.finished && st.position > 0;

    const act = async (key, fn, ok) => {
        setBusy(key);
        try {
            const res = await fn();
            if (res && ok) notify({ message: typeof ok === 'function' ? ok(res) : ok, type: 'success' });
            onChanged?.();
        } catch (e) {
            notify({ message: errText(e), type: 'warning' });
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="mi">
            <div className="mi-facts">
                <span><i className="bi bi-book" /> {pages ?? '…'} стр.</span>
                {book?.chapters.length > 1 && <span><i className="bi bi-list-ol" /> {book.chapters.length} гл.</span>}
                {st && <span className={st.finished ? 'done' : ''}>
                    <i className={`bi ${st.finished ? 'bi-check2-circle' : 'bi-bookmark'}`} /> {st.finished ? 'прочитано' : `стр. ${st.position + 1}`}
                </span>}
                {book?.removed?.length > 0 && <span title="Удалённые страницы можно вернуть в редакторе"><i className="bi bi-trash3" /> {book.removed.length}</span>}
            </div>
            <div className="mi-main">
                <button className="btn btn-sm btn-primary" onClick={() => readLibraryManga(file)}>
                    <i className="bi bi-book-half me-1" />{started ? 'Продолжить' : 'Читать'}
                </button>
                {started && <button className="btn btn-sm btn-outline-secondary" onClick={() => readLibraryManga(file, { fromStart: true })} title="С первой страницы">
                    <i className="bi bi-skip-start" />
                </button>}
                <button className="btn btn-sm btn-outline-secondary" onClick={() => openPageEditor(file)} title="Удалить, переставить, добавить страницы">
                    <i className="bi bi-grid-3x3 me-1" />Страницы
                </button>
            </div>
            <div className="mi-more">
                <button disabled={!!busy} onClick={() => act('cbz', () => mangaApi.exportCbz(file.id), r => `Сохранено: ${r.pages} стр. в CBZ`)}>
                    {busy === 'cbz' ? <i className="bi bi-arrow-repeat spin" /> : <i className="bi bi-file-zip" />} CBZ
                </button>
                <button disabled={!!busy} onClick={() => act('dir', () => mangaApi.exportFolder(file.id), r => `Сохранено страниц: ${r.pages}`)}>
                    <i className="bi bi-folder-symlink" /> В папку
                </button>
                <button disabled={!!busy} title="Каждая страница — отдельная картинка в библиотеке (манга остаётся)"
                        onClick={() => act('split', () => mangaApi.split(file.id), r => `Картинок добавлено: ${r.results.length} · Ctrl+Z — отменить`)}>
                    <i className="bi bi-images" /> На картинки
                </button>
                {st && <button disabled={!!busy} onClick={() => act('reset', () => mangaApi.resetProgress(file.id).then(() => true), 'Прогресс сброшен')}>
                    <i className="bi bi-arrow-counterclockwise" /> Сбросить прогресс
                </button>}
            </div>
        </div>
    );
};

export default MangaInfo;
