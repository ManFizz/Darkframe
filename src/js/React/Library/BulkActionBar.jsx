import React, {useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';

const BulkActionBar = ({ selectedItems, collections, onDone, permanent = false }) => {
    const [targetCollection, setTargetCollection] = useState('');
    const [tagInput, setTagInput] = useState('');

    if (selectedItems.length === 0) return null;

    const moveToCollection = async () => {
        const collectionId = targetCollection || null;
        await LibraryService.bulkUpdateItems(
            selectedItems.map(f => ({ id: f.id, data: { collectionId } }))
        );
        onDone();
    };

    const addTagToAll = async () => {
        const tag = tagInput.trim().toLowerCase();
        if (!tag) return;

        await LibraryService.bulkUpdateItems(
            selectedItems.map(f => ({
                id: f.id,
                data: { tags: [...new Set([...(f.tags || []), tag])] },
            }))
        );
        setTagInput('');
        onDone();
    };

    const deleteAll = async () => {
        // Permanent still asks; the soft path is reversible via the Undo toast.
        if (permanent && !confirm(`Удалить ${selectedItems.length} элементов навсегда?`)) return;

        const ids = selectedItems.map(f => f.id);
        for (const id of ids) {
            await LibraryService.deleteItem(id, permanent);
        }
        onDone();

        if (!permanent) {
            notify({
                message: `Перемещено в корзину: ${ids.length}`,
                type: 'info',
                duration: 6000,
                action: {
                    label: 'Отменить',
                    onClick: async () => {
                        for (const id of ids) await LibraryService.restoreItem(id);
                        onDone();
                    },
                },
            });
        }
    };

    const restoreAll = async () => {
        for (const f of selectedItems) {
            await LibraryService.restoreItem(f.id);
        }
        onDone();
    };

    return (
        <div className="bulk-action-bar">
            <span className="bulk-count">
                Выбрано: {selectedItems.length}
            </span>

            {/* In the trash we only offer restore / permanent delete. */}
            {!permanent && (
                <>
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
                </>
            )}

            {permanent && (
                <button
                    className="btn btn-sm btn-outline-success ms-auto"
                    onClick={restoreAll}
                >
                    <i className="bi bi-arrow-counterclockwise me-1" />
                    Восстановить
                </button>
            )}

            <button
                className={`btn btn-sm btn-outline-danger ${permanent ? '' : 'ms-auto'}`}
                onClick={deleteAll}
            >
                <i className="bi bi-trash me-1" />
                {permanent ? 'Удалить навсегда' : 'В корзину'}
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