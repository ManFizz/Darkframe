import React, {useEffect, useState} from 'react';
import {mangaApi} from '@/Infrastructure/Ipc';
import {notify} from '@services/NotificationService';
import {openPageEditor, readLibraryManga} from '@services/mangaLibrary';
import {openManga} from '@modules/manga/openManga';

// Sites where a manga comes out chapter by chapter (others: one gallery, done).
const CHAPTERED = new Set(['allhentai', 'mangadex']);

const errText = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// Manga block of the library side panel: read / continue, pages, export, split.
const MangaInfo = ({ file, onChanged }) => {
    const [book, setBook] = useState(null);
    const [busy, setBusy] = useState(null);
    const [fresh, setFresh] = useState(null);   // new chapters on the site: [{ id, title }]

    useEffect(() => { setFresh(null); }, [file.id]);
    useEffect(() => {
        let cancelled = false;
        mangaApi.book(file.id).then(b => { if (!cancelled) setBook(b); }).catch(() => {});
        return () => { cancelled = true; };
    }, [file.id, file.pageCount, file.editedAt]);

    const online = book?.source?.kind === 'online' ? book.source : null;
    const checkNew = () => act('new', async () => {
        const r = await mangaApi.newChapters(file.id);
        setFresh(r.chapters);
        if (!r.chapters.length) notify({ message: 'Новых глав нет', type: 'info' });
        return null;
    });
    const downloadNew = () => act('dl', async () => {
        await mangaApi.download({ source: online.site, id: online.id, chapters: fresh.map(c => c.id), appendTo: file.id, title: file.title });
        setFresh(null);
        return true;
    }, 'Новые главы в очереди загрузки');

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
            {online && (
                <div className="mi-online">
                    <button onClick={() => openManga({ open: { source: online.site, id: online.id } })} title="Карточка галереи на сайте (вкладка Manga)">
                        <i className="bi bi-globe2" /> {online.site}
                    </button>
                    {!CHAPTERED.has(online.site) ? null : fresh?.length > 0 ? (
                        <button className="accent" disabled={!!busy} onClick={downloadNew}>
                            <i className="bi bi-download" /> Скачать новые главы: {fresh.length}
                        </button>
                    ) : (
                        <button disabled={!!busy} onClick={checkNew} title="Проверить, вышли ли на сайте главы, которых здесь нет">
                            {busy === 'new' ? <i className="bi bi-arrow-repeat spin" /> : <i className="bi bi-arrow-repeat" />} Новые главы
                        </button>
                    )}
                </div>
            )}
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
