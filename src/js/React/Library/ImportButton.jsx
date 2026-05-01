import React, {useRef} from 'react';
import LibraryService from '../../Services/LibraryService';

const { ipcRenderer } = window.require('electron');

const ImportButton = ({ collectionId, onImported }) => {
    const isDragging = useRef(false);

    const handleImportDialog = async () => {
        const { results, errors } = await LibraryService.importDialog(collectionId);
        if (errors.length) console.error('Import errors:', errors);
        if (results.length) onImported?.();
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const filePaths = Array.from(e.dataTransfer.files).map(f => {
            return window.require('electron').webUtils?.getPathForFile(f) || f.path;
        }).filter(Boolean);

        if (!filePaths.length) {
            console.warn('No paths found');
            return;
        }

        const { results, errors } = await LibraryService.importFiles({ filePaths, collectionId });
        if (results.length) onImported?.();
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