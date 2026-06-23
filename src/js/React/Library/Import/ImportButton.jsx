import React, {useEffect, useState} from 'react';
import LibraryService from '@services/LibraryService';
import EagleImportProgress from './EagleImportProgress';
import {notify} from '@services/NotificationService';

const ImportButton = ({ collectionId, collectionName, onImported }) => {
    const [importing, setImporting] = useState(false);
    const [url, setUrl] = useState('');
    const [urlImporting, setUrlImporting] = useState(false);
    const [urlProgress, setUrlProgress] = useState(null);

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

        skipped.forEach(s => notify({
            message: `«${s.existingTitle}» уже есть в «${s.collectionName}»`,
            type: 'warning',
            duration: 5000,
        }));

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
                <div className="import-zone-hint">
                    {collectionName ? <>в <b>{collectionName}</b></> : 'без коллекции'}
                </div>

                <div className="import-buttons">
                    <button className="btn btn-primary btn-sm flex-fill" onClick={handleImportFiles}>
                        <i className="bi bi-file-earmark-plus me-1" />
                        Файлы
                    </button>
                    <button className="btn btn-primary btn-sm flex-fill" onClick={handleImportDirectory}>
                        <i className="bi bi-folder-plus me-1" />
                        Папку
                    </button>
                </div>

                <div className="import-url-row">
                    <input
                        className="form-control form-control-sm"
                        placeholder="Прямая ссылка на медиа (.jpg, .mp4, …)"
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

                <div className="import-buttons">
                    <button
                        className="btn btn-outline-info btn-sm flex-fill"
                        onClick={handleImportJson}
                        disabled={importing}
                    >
                        <i className="bi bi-filetype-json me-1" />
                        JSON
                    </button>
                    <button
                        className="btn btn-outline-warning btn-sm flex-fill"
                        onClick={handleImportEagle}
                        disabled={importing}
                    >
                        <i className="bi bi-box-arrow-in-down me-1" />
                        Eagle CSV
                    </button>
                </div>

                <div className="import-zone-hint text-secondary">
                    или перетащи файлы / папки
                </div>
            </div>
        </>
    );
};

export default ImportButton;
