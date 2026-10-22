import React, {useEffect, useState} from 'react';
import {mangaApi} from '@/Infrastructure/Ipc';
import {isWeb} from '@/Infrastructure/electron';
import {notify} from '@services/NotificationService';
import {openPageEditor, readLibraryManga} from '@services/mangaLibrary';
import {openManga} from '@modules/manga/openManga';

// Sites where a manga comes out chapter by chapter (others: one gallery, done).
const CHAPTERED = new Set(['allhentai', 'mangadex', 'hentai2read']);

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

    const online = book?.source?.kind === 'online' ? book.source : null;
    const sub = book?.subscription?.on ? book.subscription : null;
    const remote = book ? book.chapters.filter(c => c.remote).length : 0;
    const reload = () => mangaApi.book(file.id).then(setBook).catch(() => {});
    // New chapters on the site are added as online chapters (read at once, download later).
    const checkNew = () => act('new', async () => {
        const r = await mangaApi.checkUpdates(file.id);
        await reload();
        notify(r.added.length
            ? { message: `Новых глав: ${r.added.length}${r.queued ? ' — в очереди загрузки' : ' — читаются онлайн'}`, type: 'success' }
            : { message: 'Новых глав нет', type: 'info' });
        return null;
    });
    const downloadRemote = () => act('dl', async () => {
        const r = await mangaApi.downloadRemote(file.id);
        return r;
    }, `Онлайн-главы (${remote}) в очереди загрузки`);
    const toggleSub = () => act('sub', async () => {
        await mangaApi.setSubscription(file.id, !sub);
        await reload();
        return true;
    }, sub ? 'Подписка отменена' : 'Подписка оформлена — новые главы будут появляться сами');

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
                {!(book && pages === 0) && <span><i className="bi bi-book" /> {pages ?? '…'} стр.</span>}
                {book?.chapters.length > 1 && <span><i className="bi bi-list-ol" /> {book.chapters.length} гл.</span>}
                {remote > 0 && <span title="Главы не скачаны — читаются с сайта"><i className="bi bi-cloud" /> {remote === book.chapters.length ? 'онлайн' : `онлайн: ${remote}`}</span>}
                {sub?.unseen > 0 && <span className="new"><i className="bi bi-stars" /> новых: {sub.unseen}</span>}
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
                {pages !== 0 && <button className="btn btn-sm btn-outline-secondary" onClick={() => openPageEditor(file)} title="Удалить, переставить, добавить страницы">
                    <i className="bi bi-grid-3x3 me-1" />Страницы
                </button>}
            </div>
            {online && (
                <div className="mi-online">
                    <button onClick={() => openManga({ open: { source: online.site, id: online.id } })} title="Карточка галереи на сайте (вкладка Manga)">
                        <i className="bi bi-globe2" /> {online.site}
                    </button>
                    {CHAPTERED.has(online.site) && (
                        <button className={sub ? 'on' : ''} disabled={!!busy} onClick={toggleSub}
                                title={sub ? `Подписка: новые главы проверяются сами${sub.checkedAt ? ` · проверено ${new Date(sub.checkedAt * 1000).toLocaleString('ru')}` : ''}${sub.error ? `
Ошибка: ${sub.error}` : ''}
Нажмите, чтобы отписаться` : 'Подписаться: новые главы будут появляться сами'}>
                            <i className={`bi ${sub ? 'bi-bell-fill' : 'bi-bell'}`} /> {sub ? 'Подписка' : 'Подписаться'}
                        </button>
                    )}
                    {CHAPTERED.has(online.site) && (
                        <button disabled={!!busy} onClick={checkNew} title="Проверить, вышли ли на сайте главы, которых здесь нет">
                            <i className={`bi bi-arrow-repeat ${busy === 'new' ? 'spin' : ''}`} /> Проверить обновления
                        </button>
                    )}
                    {remote > 0 && (
                        <button className="accent" disabled={!!busy} onClick={downloadRemote} title="Скачать главы, которые сейчас читаются с сайта">
                            <i className="bi bi-download" /> Скачать {remote === book.chapters.length ? 'всё' : `онлайн-главы: ${remote}`}
                        </button>
                    )}
                </div>
            )}
            <div className="mi-more">
                {pages !== 0 && <>
                {!isWeb && <>
                <button disabled={!!busy} onClick={() => act('cbz', () => mangaApi.exportCbz(file.id), r => `Сохранено: ${r.pages} стр. в CBZ`)}>
                    {busy === 'cbz' ? <i className="bi bi-arrow-repeat spin" /> : <i className="bi bi-file-zip" />} CBZ
                </button>
                <button disabled={!!busy} onClick={() => act('dir', () => mangaApi.exportFolder(file.id), r => `Сохранено страниц: ${r.pages}`)}>
                    <i className="bi bi-folder-symlink" /> В папку
                </button>
                </>}
                <button disabled={!!busy} title="Каждая страница — отдельная картинка в библиотеке (манга остаётся)"
                        onClick={() => act('split', () => mangaApi.split(file.id), r => `Картинок добавлено: ${r.results.length} · Ctrl+Z — отменить`)}>
                    <i className="bi bi-images" /> На картинки
                </button>
                </>}
                {st && <button disabled={!!busy} onClick={() => act('reset', () => mangaApi.resetProgress(file.id).then(() => true), 'Прогресс сброшен')}>
                    <i className="bi bi-arrow-counterclockwise" /> Сбросить прогресс
                </button>}
            </div>
        </div>
    );
};

export default MangaInfo;
