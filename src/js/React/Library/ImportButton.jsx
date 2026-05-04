import React, {useState} from 'react';
import LibraryService from '@services/LibraryService';
import EagleImportProgress from './EagleImportProgress';

import {notify} from '@services/NotificationService';

const ImportButton = ({ collectionId, collectionName, onImported }) => {
    const [importing, setImporting] = useState(false);

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

    const handleImportFiles = async () => {
        const raw = await LibraryService.importDialog(collectionId);
        await handleImport(raw);
    };

    const handleImportDirectory = async () => {
        const raw = await LibraryService.importDirectoryDialog(collectionId);
        await handleImport(raw);
    };

    const handleImport = async ({ results = [], skipped = [], errors = [] }) => {
        if (results.length > 0) {
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
        const fs = window.require('fs');
        const filePaths = [];
        const dirPaths = [];

        // Используем webkitGetAsEntry для различения файлов и папок
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
            const r = await LibraryService.importDirectoryDialog
                ? await LibraryService.importDirectory({ dirPath, collectionId })
                : null;
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
                <div className="import-buttons">
                    <button className="btn btn-primary btn-sm" onClick={handleImportFiles}>
                        <i className="bi bi-file-earmark-plus me-1" />
                        Файлы
                    </button>
                    <button className="btn btn-outline-primary btn-sm" onClick={handleImportDirectory}>
                        <i className="bi bi-folder-plus me-1" />
                        Папку
                    </button>
                    <button
                        className="btn btn-outline-warning btn-sm"
                        onClick={handleImportEagle}
                        disabled={importing}
                    >
                        <i className="bi bi-box-arrow-in-down me-1" />
                        Eagle CSV
                    </button>
                </div>
                <span className="import-zone-hint">
                    {collectionName ? <>в <b>{collectionName}</b></> : 'без коллекции'}
                </span>
                <span className="import-zone-hint text-secondary" style={{ fontSize: 11 }}>
                    или перетащи файлы / папки
                </span>
            </div>
        </>
    );
};

export default ImportButton;