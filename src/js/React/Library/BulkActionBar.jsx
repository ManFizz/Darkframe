import React, {useState} from 'react';
import LibraryService from '../../Services/LibraryService';

const BulkActionBar = ({ selectedItems, collections, onDone }) => {
    const [targetCollection, setTargetCollection] = useState('');
    const [tagInput, setTagInput] = useState('');

    if (selectedItems.length === 0) return null;

    const moveToCollection = async () => {
        const collectionId = targetCollection || null;
        await Promise.all(
            selectedItems.map(f =>
                LibraryService.updateItem(f.id, { collectionId })
            )
        );
        onDone();
    };

    const addTagToAll = async () => {
        const tag = tagInput.trim().toLowerCase();
        if (!tag) return;

        await Promise.all(
            selectedItems.map(f => {
                const tags = [...new Set([...(f.tags || []), tag])];
                return LibraryService.updateItem(f.id, { tags });
            })
        );
        setTagInput('');
        onDone();
    };

    const deleteAll = async () => {
        if (!confirm(`Удалить ${selectedItems.length} файлов?`)) return;
        await Promise.all(
            selectedItems.map(f => LibraryService.deleteItem(f.id, true))
        );
        onDone();
    };

    return (
        <div className="bulk-action-bar">
            <span className="bulk-count">
                Выбрано: {selectedItems.length}
            </span>

            <div className="bulk-action-group">
                <select
                    className="form-select form-select-sm"
                    value={targetCollection}
                    onChange={e => setTargetCollection(e.target.value)}
                >
                    <option value="">Без коллекции</option>
                    {collections.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={moveToCollection}
                >
                    <i className="bi bi-folder-symlink me-1" />
                    Переместить
                </button>
            </div>

            <div className="bulk-action-group">
                <input
                    className="form-control form-control-sm"
                    placeholder="Тег..."
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addTagToAll()}
                />
                <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={addTagToAll}
                >
                    <i className="bi bi-tag me-1" />
                    Добавить тег
                </button>
            </div>

            <button
                className="btn btn-sm btn-outline-danger ms-auto"
                onClick={deleteAll}
            >
                <i className="bi bi-trash me-1" />
                Удалить
            </button>

            <button
                className="btn btn-sm btn-outline-secondary"
                onClick={onDone}
            >
                <i className="bi bi-x" />
            </button>
        </div>
    );
};

export default BulkActionBar;