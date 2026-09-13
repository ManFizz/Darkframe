import React, {useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import {loadEditPreset} from '@services/imageEditPreset';
import {FILE_TYPES} from '@/Constants';

const BulkActionBar = ({ selectedItems, collections, onDone, permanent = false, totalCount = 0, onSelectAll, onInvert, onClear }) => {
    const [targetCollection, setTargetCollection] = useState('');
    const [tagInput, setTagInput] = useState('');

    if (selectedItems.length === 0) return null;

    const allSelected = totalCount > 0 && selectedItems.length >= totalCount;

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
        await LibraryService.deleteItems(ids, permanent);   // one IPC call
        onDone();

        if (!permanent) {
            notify({
                message: `Перемещено в корзину: ${ids.length}`,
                type: 'info',
                duration: 6000,
                action: {
                    label: 'Отменить',
                    onClick: async () => { await LibraryService.restoreItems(ids); onDone(); },
                },
            });
        }
    };

    const restoreAll = async () => {
        await LibraryService.restoreItems(selectedItems.map(f => f.id));
        onDone();
    };

    // Re-apply the last in-editor rotate/crop to every selected image — the fast path
    // for a batch of shots with the same black bars / resolution.
    const applyLastEdit = async () => {
        const preset = loadEditPreset();
        if (!preset) return;
        const targets = selectedItems.filter(f => f.type === FILE_TYPES.IMAGE && f.mimeType !== 'image/gif');
        if (!targets.length) { notify({ message: 'Нет подходящих изображений', type: 'warning' }); return; }
        if (!confirm(`Применить последнюю правку к ${targets.length} изображениям?`)) return;

        let ok = 0, fail = 0;
        for (const f of targets) {
            try { await LibraryService.editImage(f.id, preset); ok++; }
            catch { fail++; }
        }
        notify({
            message: fail ? `Применено: ${ok}, ошибок: ${fail}` : `Правка применена: ${ok}`,
            type: fail ? 'warning' : 'success',
        });
        onDone();
    };

    const hasPreset = !permanent && !!loadEditPreset();

    return (
        <div className="bulk-action-bar">
            <span className="bulk-count">
                <i className="bi bi-check2-square me-1" />
                {selectedItems.length}
            </span>

            {/* Selection controls */}
            <div className="bulk-select-controls">
                {!allSelected && onSelectAll && (
                    <button className="bulk-linkbtn" onClick={onSelectAll} title="Выделить всё (Ctrl+A)">
                        Все{totalCount ? ` (${totalCount})` : ''}
                    </button>
                )}
                {onInvert && (
                    <button className="bulk-linkbtn" onClick={onInvert} title="Инвертировать (Ctrl+I)">
                        Инверт.
                    </button>
                )}
            </div>

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

                    {hasPreset && (
                        <button
                            className="btn btn-sm btn-outline-primary"
                            title="Применить последнюю правку (поворот / обрезку) ко всем выбранным"
                            onClick={applyLastEdit}
                        >
                            <i className="bi bi-magic me-1" />
                            Применить правку
                        </button>
                    )}
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
                onClick={onClear || onDone}
                title="Снять выделение (Esc)"
            >
                <i className="bi bi-x" />
            </button>
        </div>
    );
};

export default BulkActionBar;
