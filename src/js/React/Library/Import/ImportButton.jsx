import React, {useEffect, useState} from 'react';
import LibraryService from '@services/LibraryService';
import EagleImportProgress from './EagleImportProgress';
import {notify} from '@services/NotificationService';

const ImportButton = ({ collectionId, collectionName, onImported }) => {
    const [importing, setImporting] = useState(false);
    const [url, setUrl] = useState('');
    const [urlImporting, setUrlImporting] = useState(false);
    const [urlProgress, setUrlProgress] = useState(null);
    // The secondary import paths (link/folder/json/csv) are hidden until asked for —
    // "Добавить файлы" is the one action people reach for 95% of the time.
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        const { ipcRenderer } = window.require('electron');
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

        // Duplicates aren't dropped silently anymore: ask once (per import) whether to
        // add them anyway. Non-blocking — the unique files are already in by now, and
        // this single toast lets the user opt the duplicates in with one click.
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

        const { webUtils } = window.require('electron');
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

        if (filePaths.length) {
            const r = await LibraryService.importFiles({ filePaths, collectionId });
            allResults.results.push(...(r.results || []));
            allResults.skipped.push(...(r.skipped || []));
            allResults.errors.push(...(r.errors || []));
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
                <button className="import-primary" onClick={handleImportFiles}>
                    <i className="bi bi-plus-lg" />
                    Добавить файлы
                </button>

                <div className="import-target">
                    {collectionName ? <>в <b>{collectionName}</b></> : 'без коллекции'}
                </div>

                {/* Secondary paths — collapsed until requested */}
                <button
                    className={`import-more-toggle ${expanded ? 'open' : ''}`}
                    onClick={() => setExpanded(v => !v)}
                >
                    <i className="bi bi-chevron-down" />
                    Ссылка · Папка · JSON · CSV
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
                                    ? <i className="bi bi-arrow-repeat spin" />
                                    : <i className="bi bi-link-45deg" />}
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

                        <div className="import-more-actions">
                            <button className="import-ghost" onClick={handleImportDirectory}>
                                <i className="bi bi-folder-plus" /> Папку
                            </button>
                            <button className="import-ghost" onClick={handleImportJson} disabled={importing}>
                                <i className="bi bi-filetype-json" /> JSON
                            </button>
                            <button className="import-ghost" onClick={handleImportEagle} disabled={importing}>
                                <i className="bi bi-box-arrow-in-down" /> CSV
                            </button>
                        </div>
                    </div>
                )}

                <div className="import-drop-hint">
                    или перетащи файлы / папки
                </div>
            </div>
        </>
    );
};

export default ImportButton;
