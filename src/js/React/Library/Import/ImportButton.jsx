import React, {useEffect, useRef, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {mangaApi} from '@/Infrastructure/Ipc';
import EagleImportProgress from './EagleImportProgress';
import {notify} from '@services/NotificationService';
import {ipcRenderer, isWeb, uploadFile, webUtils} from '@/Infrastructure/electron';

const ImportButton = ({ collectionId, collectionName, onImported }) => {
    const [importing, setImporting] = useState(false);
    const [url, setUrl] = useState('');
    const [urlImporting, setUrlImporting] = useState(false);
    const [urlProgress, setUrlProgress] = useState(null);
    // The secondary import paths (link / folder / JSON / CSV) stay hidden until asked
    // for: adding files is what people reach for almost every time.
    const [expanded, setExpanded] = useState(false);
    const fileInput = useRef(null);
    const [uploading, setUploading] = useState(null);   // { done, total } — phone uploads

    // Phone / browser: files from the device go up to the PC one by one.
    const uploadAll = async (files) => {
        const list = [...files];
        if (!list.length) return;
        const all = { results: [], skipped: [], errors: [] };
        setUploading({ done: 0, total: list.length });
        for (let i = 0; i < list.length; i++) {
            try {
                const r = await uploadFile(list[i], { collectionId: collectionId ?? null });
                all.results.push(...(r.results || []));
                all.skipped.push(...(r.skipped || []).map(s => ({ ...s, filePath: null })));
                all.errors.push(...(r.errors || []));
            } catch (e) {
                all.errors.push({ error: e.message });
            }
            setUploading({ done: i + 1, total: list.length });
        }
        setUploading(null);
        await handleImport(all);
    };

    useEffect(() => {
        const handler = (_, p) => setUrlProgress(p);
        ipcRenderer.on('library:urlImportProgress', handler);
        return () => ipcRenderer.removeListener('library:urlImportProgress', handler);
    }, []);

    const handleImportUrl = async () => {
        const trimmed = url.trim();
        if (!trimmed || urlImporting) return;

        setUrlImporting(true);
        setUrlProgress(null);
        try {
            const result = await LibraryService.importUrl({ url: trimmed, collectionId });

            // Surface the real download reason instead of a generic message
            if (result.errors?.length) {
                const reason = String(result.errors[0].error || '')
                    .split('\n').filter(Boolean).pop() || 'неизвестная ошибка';
                notify({ message: `Не удалось загрузить: ${reason}`, type: 'danger', duration: 8000 });
                return;
            }

            await handleImport(result);
            if (result.results?.length) setUrl('');
        } catch (e) {
            notify({ message: `Ошибка загрузки по ссылке: ${e.message}`, type: 'danger' });
        } finally {
            setUrlImporting(false);
            setUrlProgress(null);
        }
    };

    const handleImportEagle = async () => {
        setImporting(true);
        try {
            const result = await LibraryService.importFromEagle({ collectionId });
            if (!result) return;
            await handleImport(result);
        } finally {
            setImporting(false);
        }
    };

    const handleImportJson = async () => {
        setImporting(true);
        try {
            const result = await LibraryService.importFromJson({ collectionId });
            if (!result) return;
            await handleImport(result);
        } finally {
            setImporting(false);
        }
    };

    const handleImportFiles = async () => {
        if (isWeb) { fileInput.current?.click(); return; }
        const raw = await LibraryService.importDialog(collectionId);
        await handleImport(raw);
    };

    const handleImportDirectory = async () => {
        const raw = await LibraryService.importDirectoryDialog(collectionId);
        await handleImport(raw);
    };

    const handleImport = async ({ results = [], skipped = [], errors = [] }) => {
        if (results.length === 1) {
            const f = results[0];
            const name = f.title || f.fileName || 'файл';
            notify({
                message: `«${name}» добавлен в «${collectionName || 'Без коллекции'}»`,
                type: 'success',
            });
            onImported?.();
        } else if (results.length > 1) {
            notify({ message: `Добавлено файлов: ${results.length}`, type: 'success' });
            onImported?.();
        }

        if (!results.length && !skipped.length) {
            notify({ message: 'Подходящих файлов не найдено', type: 'warning' });
        }

        // Files matching something already in the trash aren't silently restored:
        // ask once whether to pull them out. "No" (ignoring the toast) leaves both the
        // import and the trash untouched.
        const trashed = skipped.filter(s => s.reason === 'trashed' && s.existingId);
        if (trashed.length) {
            notify({
                message: trashed.length === 1
                    ? `«${trashed[0].existingTitle}» лежит в корзине`
                    : `В корзине: ${trashed.length} (совпадают с импортируемыми)`,
                type: 'warning',
                duration: 12000,
                action: {
                    label: 'Достать из корзины',
                    onClick: async () => {
                        let ok = 0;
                        for (const t of trashed) {
                            try { await LibraryService.restoreItem(t.existingId); ok++; } catch { /* skip */ }
                        }
                        notify({
                            message: ok ? `Восстановлено из корзины: ${ok}` : 'Не удалось восстановить',
                            type: ok ? 'success' : 'danger',
                        });
                        if (ok) onImported?.();
                    },
                },
            });
        }

        // Duplicates: one toast per import offers to add them anyway (the unique
        // files are already in).
        const dupes = skipped.filter(s => s.reason === 'duplicate' && s.filePath);
        if (dupes.length) {
            notify({
                message: dupes.length === 1
                    ? `«${dupes[0].existingTitle}» уже есть в библиотеке`
                    : `Дубликатов пропущено: ${dupes.length} (уже есть в библиотеке)`,
                type: 'warning',
                duration: 12000,
                action: {
                    label: 'Добавить всё равно',
                    onClick: async () => {
                        const r = await LibraryService.importFiles({
                            filePaths: dupes.map(d => d.filePath),
                            collectionId,
                            allowDuplicate: true,
                        });
                        const added = r.results?.length || 0;
                        notify({
                            message: added ? `Добавлено дубликатов: ${added}` : 'Не удалось добавить дубликаты',
                            type: added ? 'success' : 'danger',
                        });
                        if (added) onImported?.();
                    },
                },
            });
        }

        errors.forEach(() => notify({
            message: `Ошибка импорта: ${errors.length} файлов`,
            type: 'danger',
        }));
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isWeb) { await uploadAll(e.dataTransfer.files); return; }

        
        const filePaths = [];
        const dirPaths = [];

        const items = Array.from(e.dataTransfer.items);

        for (const item of items) {
            if (item.kind !== 'file') continue;

            const entry = item.webkitGetAsEntry?.();
            const file = item.getAsFile();
            const p = file ? webUtils?.getPathForFile(file) : null;

            if (!p) continue;

            if (entry?.isDirectory) {
                dirPaths.push(p);
            } else {
                filePaths.push(p);
            }
        }

        const allResults = { results: [], skipped: [], errors: [] };

        // CBZ / ZIP archives are manga.
        const archives = filePaths.filter(p => /\.(cbz|zip)$/i.test(p));
        if (archives.length) {
            const r = await mangaApi.importArchives(archives, collectionId ?? null);
            notify({
                message: r.items.length ? `Манга добавлена: ${r.items.length}${r.errors.length ? ` · ошибок: ${r.errors.length}` : ''}` : `Не удалось: ${r.errors[0]?.error || 'нет картинок'}`,
                type: r.items.length ? 'success' : 'warning',
            });
            filePaths.splice(0, filePaths.length, ...filePaths.filter(p => !archives.includes(p)));
            if (r.items.length) onImported?.();
        }

        if (filePaths.length) {
            const r = await LibraryService.importFiles({ filePaths, collectionId });
            allResults.results.push(...(r.results || []));
            allResults.skipped.push(...(r.skipped || []));
            allResults.errors.push(...(r.errors || []));
        }

        // Shift + drop a folder = a manga made of it.
        if (e.shiftKey && dirPaths.length) {
            for (const dirPath of dirPaths.splice(0)) {
                try {
                    await mangaApi.importFolder(dirPath, { collectionId: collectionId ?? null });
                    notify({ message: 'Манга из папки добавлена', type: 'success' });
                } catch (err) { notify({ message: String(err.message).split(': ').pop(), type: 'warning' }); }
            }
            onImported?.();
        }

        for (const dirPath of dirPaths) {
            const r = await LibraryService.importDirectory({ dirPath, collectionId });
            if (r) {
                allResults.results.push(...(r.results || []));
                allResults.skipped.push(...(r.skipped || []));
                allResults.errors.push(...(r.errors || []));
            }
        }

        await handleImport(allResults);
    };

    return (
        <>
            {importing && (
                <EagleImportProgress onDone={() => { setImporting(false); onImported?.(); }} />
            )}

            <div className="import-zone" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
                {/* Primary path — one clear button */}
                <button className="import-primary" onClick={handleImportFiles} disabled={!!uploading}>
                    {uploading
                        ? <><i aria-hidden="true" className="bi bi-arrow-repeat spin" /> Загрузка {uploading.done}/{uploading.total}</>
                        : <><i aria-hidden="true" className="bi bi-plus-lg" /> Добавить файлы</>}
                </button>
                {isWeb && (
                    <input ref={fileInput} type="file" multiple hidden accept="image/*,video/*,.cbz,.zip"
                           onChange={e => { uploadAll(e.target.files); e.target.value = ''; }} />
                )}

                <div className="import-target">
                    {collectionName ? <>в <b>{collectionName}</b></> : 'без коллекции'}
                </div>

                {/* Secondary paths — collapsed until requested */}
                <button
                    className={`import-more-toggle ${expanded ? 'open' : ''}`}
                    onClick={() => setExpanded(v => !v)}
                >
                    <i aria-hidden="true" className="bi bi-chevron-down" />
                    {isWeb ? 'По ссылке' : 'Ссылка · Папка · JSON · CSV'}
                </button>

                {expanded && (
                    <div className="import-more">
                        <div className="import-url-row">
                            <input
                                className="form-control form-control-sm"
                                placeholder="Прямая ссылка (.jpg, .mp4, …)"
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleImportUrl(); }}
                                disabled={urlImporting}
                            />
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={handleImportUrl}
                                disabled={urlImporting || !url.trim()}
                                title="Загрузить по ссылке"
                            >
                                {urlImporting
                                    ? <i aria-hidden="true" className="bi bi-arrow-repeat spin" />
                                    : <i aria-hidden="true" className="bi bi-link-45deg" />}
                            </button>
                        </div>

                        {urlImporting && (
                            <div className="import-url-progress">
                                {urlProgress?.percent != null ? (
                                    <>
                                        <div className="progress" style={{ height: 6 }}>
                                            <div
                                                className="progress-bar"
                                                style={{ width: `${urlProgress.percent}%`, transition: 'width .2s' }}
                                            />
                                        </div>
                                        <span>
                                            {Math.round(urlProgress.percent)}%
                                            {urlProgress.eta ? ` · ${urlProgress.eta}` : ''}
                                        </span>
                                    </>
                                ) : (
                                    <span>Загрузка…</span>
                                )}
                            </div>
                        )}

                        {!isWeb && <>
                        <div className="import-more-actions">
                            <button className="import-ghost" onClick={handleImportDirectory}>
                                <i aria-hidden="true" className="bi bi-folder-plus" /> Папку
                            </button>
                            <button className="import-ghost" onClick={handleImportJson} disabled={importing}>
                                <i aria-hidden="true" className="bi bi-filetype-json" /> JSON
                            </button>
                            <button className="import-ghost" onClick={handleImportEagle} disabled={importing}>
                                <i aria-hidden="true" className="bi bi-box-arrow-in-down" /> CSV
                            </button>
                        </div>
                        <div className="import-more-actions">
                            <button className="import-ghost" title="Картинки папки — страницы; подпапки — главы"
                                    onClick={async () => { const r = await mangaApi.importFolderDialog({ collectionId: collectionId ?? null }).catch(e => { notify({ message: String(e.message).split(': ').pop(), type: 'warning' }); return null; }); if (r?.length) { notify({ message: `Манга добавлена: ${r.length}`, type: 'success' }); onImported?.(); } }}>
                                <i aria-hidden="true" className="bi bi-book" /> Манга из папки
                            </button>
                            <button className="import-ghost" title="Комиксы / манга в CBZ или ZIP"
                                    onClick={async () => { const r = await mangaApi.importArchiveDialog({ collectionId: collectionId ?? null }); if (r) { notify({ message: r.items.length ? `Манга добавлена: ${r.items.length}${r.errors.length ? ` · ошибок: ${r.errors.length}` : ''}` : `Не удалось: ${r.errors[0]?.error}`, type: r.items.length ? 'success' : 'warning' }); onImported?.(); } }}>
                                <i aria-hidden="true" className="bi bi-file-zip" /> CBZ / ZIP
                            </button>
                        </div>
                        </>}
                    </div>
                )}

                <div className="import-drop-hint">
                    {isWeb
                        ? 'Файлы с этого устройства уйдут в библиотеку на компьютере · CBZ / ZIP — как манга'
                        : 'или перетащи файлы / папки · CBZ — как мангу · Shift + папка — манга'}
                </div>
            </div>
        </>
    );
};

export default ImportButton;
