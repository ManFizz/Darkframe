import React, {useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import {loadEditPreset} from '@services/imageEditPreset';
import {FILE_TYPES} from '@/Constants';
import BulkTags from './BulkTags';
import {autotagItems} from '@services/autotagRun';
import {compareItemFromThumb, openCompare} from '../Compare/CompareView';
import CollectionTreeSelect, {pushRecentCollection} from './Collection/CollectionTreeSelect';

const fmtMB = (b) => `${(b / 1024 / 1024).toFixed(1)} МБ`;

const BulkActionBar = ({ selectedItems, onDone, onChanged, onSlideshow, permanent = false, totalCount = 0, onSelectAll, onInvert, onClear }) => {
    const [tagging, setTagging] = useState(null);   // autotag progress
    const [moveOpen, setMoveOpen] = useState(false);
    const [compressOpen, setCompressOpen] = useState(false);
    const [cFormat, setCFormat]   = useState('webp');
    const [cQuality, setCQuality] = useState(85);
    const [cMaxSide, setCMaxSide] = useState('');
    const [busy, setBusy] = useState(null);   // progress label while a batch runs

    if (selectedItems.length === 0) return null;

    // Highlight the target only when every selected item already sits in it.
    const firstCol = selectedItems[0].collectionId ?? null;
    const commonCollection = selectedItems.every(f => (f.collectionId ?? null) === firstCol) ? firstCol : undefined;

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

    const moveToCollection = async (collectionId) => {
        setMoveOpen(false);
        pushRecentCollection(collectionId);
        await LibraryService.bulkUpdateItems(
            selectedItems.map(f => ({ id: f.id, data: { collectionId } }))
        );
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
                    <div className="bulk-action-group bulk-move">
                        <button
                            className={`btn btn-sm btn-outline-primary ${moveOpen ? 'active' : ''}`}
                            onClick={() => setMoveOpen(v => !v)}
                        >
                            <i className="bi bi-folder-symlink me-1" />
                            Переместить в…
                        </button>
                        {moveOpen && (
                            <>
                                <div className="bulk-move-backdrop" onMouseDown={() => setMoveOpen(false)} />
                                <div className="bulk-move-panel">
                                    <CollectionTreeSelect
                                        value={commonCollection}
                                        onSelect={moveToCollection}
                                        onClose={() => setMoveOpen(false)}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    <BulkTags selectedItems={selectedItems} onChanged={onChanged} />

                    <button className="btn btn-sm btn-outline-secondary" disabled={!!tagging}
                            title="Локальная нейросеть добавит теги по картинкам (Ctrl+Z — отменить)"
                            onClick={async () => {
                                setTagging({ done: 0, total: selectedItems.length });
                                try { await autotagItems(selectedItems.map(f => f.id), { onProgress: setTagging }); }
                                finally { setTagging(null); onChanged?.(); }
                            }}>
                        {tagging ? <><i className="bi bi-arrow-repeat spin me-1" />{tagging.done}/{tagging.total}</>
                            : <><i className="bi bi-stars me-1" /> Автотеги</>}
                    </button>

                    {onSlideshow && selectedItems.length > 1 && (
                        <button className="btn btn-sm btn-outline-secondary" onClick={onSlideshow} title="Слайд-шоу из выделенных">
                            <i className="bi bi-play-circle me-1" /> Слайд-шоу
                        </button>
                    )}

                    {selectedItems.length === 2 && (
                        <button className="btn btn-sm btn-outline-secondary"
                                onClick={() => openCompare(selectedItems.map(compareItemFromThumb), { onDone: onDone })}
                                title="Сравнить два файла бок о бок">
                            <i className="bi bi-layout-split me-1" /> Сравнить
                        </button>
                    )}

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
