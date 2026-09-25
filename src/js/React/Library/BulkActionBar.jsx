import React, {useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import {loadEditPreset} from '@services/imageEditPreset';
import {FILE_TYPES} from '@/Constants';
import {recordTagUse} from '@services/tagPrefs';

const fmtMB = (b) => `${(b / 1024 / 1024).toFixed(1)} МБ`;

const BulkActionBar = ({ selectedItems, collections, onDone, permanent = false, totalCount = 0, onSelectAll, onInvert, onClear }) => {
    const [targetCollection, setTargetCollection] = useState('');
    const [tagInput, setTagInput] = useState('');
    const [compressOpen, setCompressOpen] = useState(false);
    const [cFormat, setCFormat]   = useState('webp');
    const [cQuality, setCQuality] = useState(85);
    const [cMaxSide, setCMaxSide] = useState('');
    const [busy, setBusy] = useState(null);   // progress label while a batch runs

    if (selectedItems.length === 0) return null;

    // Re-encode every selected still image (format / quality / max side). Each keeps
    // its own crop/colour edits, and the pristine original stays available for revert.
    const compressAll = async () => {
        const targets = selectedItems.filter(f => f.type === FILE_TYPES.IMAGE && f.mimeType !== 'image/gif');
        if (!targets.length) { notify({ message: 'Нет подходящих изображений (GIF и видео пропускаются)', type: 'warning' }); return; }
        if (!confirm(`Пересжать ${targets.length} изображений? Оригиналы сохранятся — можно будет откатить.`)) return;
        setCompressOpen(false);

        const output = {
            format: cFormat,
            quality: cQuality,
            maxSide: cMaxSide ? Math.max(16, Math.round(Number(cMaxSide))) : null,
        };
        let ok = 0, fail = 0, before = 0, after = 0;
        for (let i = 0; i < targets.length; i++) {
            const f = targets[i];
            setBusy(`Сжатие ${i + 1} / ${targets.length}`);
            try {
                const res = await LibraryService.recompressImage(f.id, output);
                ok++;
                before += f.size || 0;
                after += res?.size || 0;
            } catch { fail++; }
        }
        setBusy(null);
        const saved = before - after;
        notify({
            message: `Пересжато: ${ok}${fail ? `, ошибок: ${fail}` : ''}` +
                (before ? ` · ${fmtMB(before)} → ${fmtMB(after)}${saved > 0 ? ` (−${fmtMB(saved)})` : ''}` : ''),
            type: fail ? 'warning' : 'success',
            duration: 8000,
        });
        onDone();
    };

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
        recordTagUse(tag);

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
                            title="Применить последнюю правку (поворот / обрезку / цвет) ко всем выбранным"
                            onClick={applyLastEdit}
                        >
                            <i className="bi bi-magic me-1" />
                            Применить правку
                        </button>
                    )}

                    <div className="bulk-compress">
                        <button
                            className={`btn btn-sm btn-outline-secondary ${compressOpen ? 'active' : ''}`}
                            title="Пересжать выбранные изображения"
                            onClick={() => setCompressOpen(v => !v)}
                            disabled={!!busy}
                        >
                            <i className="bi bi-file-earmark-zip me-1" />
                            {busy || 'Сжать'}
                        </button>
                        {compressOpen && (
                            <div className="bulk-compress-panel">
                                <div className="bulk-compress-row">
                                    <span>Формат</span>
                                    <select className="form-select form-select-sm" value={cFormat} onChange={e => setCFormat(e.target.value)}>
                                        <option value="keep">Как есть</option>
                                        <option value="jpeg">JPEG</option>
                                        <option value="webp">WebP</option>
                                    </select>
                                </div>
                                <div className="bulk-compress-row">
                                    <span>Качество</span>
                                    <input type="range" min={30} max={100} value={cQuality} onChange={e => setCQuality(Number(e.target.value))} />
                                    <b>{cQuality}</b>
                                </div>
                                <div className="bulk-compress-row">
                                    <span>Макс. сторона</span>
                                    <input
                                        className="form-control form-control-sm"
                                        type="number" min={16} placeholder="без изменений"
                                        value={cMaxSide}
                                        onChange={e => setCMaxSide(e.target.value)}
                                    />
                                </div>
                                <button className="btn btn-sm btn-primary w-100" onClick={compressAll}>
                                    Пересжать
                                </button>
                            </div>
                        )}
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
                onClick={onClear || onDone}
                title="Снять выделение (Esc)"
            >
                <i className="bi bi-x" />
            </button>
        </div>
    );
};

export default BulkActionBar;
