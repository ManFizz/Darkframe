import React, {useRef} from 'react';
import LibraryService from '../../Services/LibraryService';

import {notify} from '../../Services/NotificationService';

const ImportButton = ({ collectionId, onImported }) => {
    const isDragging = useRef(false);

    const handleImport = async (filePaths) => {
        const { results, skipped, errors } = await LibraryService.importFiles({
            filePaths,
            collectionId,
        });

        if (results.length > 0) {
            notify({
                message: `Добавлено файлов: ${results.length}`,
                type: 'success',
            });
            onImported?.();
        }

        skipped.forEach(s => {
            notify({
                message: `«${s.existingTitle}» уже есть в коллекции «${s.collectionName}»`,
                type: 'warning',
                duration: 5000,
            });
        });

        errors.forEach(e => {
            notify({
                message: `Ошибка импорта: ${e.filePath}`,
                type: 'danger',
            });
        });
    };

    const handleImportDialog = async () => {
        const result = await LibraryService.importDialog(collectionId);
        await handleImport(result.filePaths || []);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const filePaths = [];
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
            const p = window.require('electron').webUtils?.getPathForFile(e.dataTransfer.files[i]);
            if (p) filePaths.push(p);
        }

        if (!filePaths.length) return;
        await handleImport(filePaths);
    };

    return (
        <div
            className="import-zone"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
        >
            <button className="btn btn-primary btn-sm" onClick={handleImportDialog}>
                <i className="bi bi-plus-lg me-1" />
                Импорт
            </button>
            <span className="import-zone-hint">или перетащи файлы сюда</span>
        </div>
    );
};

export default ImportButton;