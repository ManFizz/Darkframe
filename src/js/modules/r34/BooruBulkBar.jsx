import React, {useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import CollectionTreeSelect, {pushRecentCollection} from '@/React/Library/Collection/CollectionTreeSelect';
import {markInLibrary, postKey} from './libraryLinks';

// Floating bar over the booru grid while posts are selected: save them all to the
// library (with their tags, into a collection) — one after another, like the viewer's
// "save" button does for a single post.
const BooruBulkBar = ({ selectedItems, inLibrary, totalCount, onSelectAll, onClear }) => {
    const [picking, setPicking] = useState(false);
    const [withTags, setWithTags] = useState(true);
    const [progress, setProgress] = useState(null);   // { done, total }

    const fresh = selectedItems.filter(f => !inLibrary.has(postKey(f.sourceUrl)));

    const save = async (collectionId) => {
        setPicking(false);
        pushRecentCollection(collectionId);
        const todo = fresh;
        let ok = 0, dup = 0, fail = 0;
        setProgress({ done: 0, total: todo.length });
        for (const f of todo) {
            try {
                const res = await LibraryService.importUrl({
                    url: f.getUrl(),
                    collectionId,
                    tags: withTags ? f.tags : [],
                    sourceUrl: f.sourceUrl,
                });
                if (res?.results?.length) { ok++; markInLibrary(f.sourceUrl); }
                else if (res?.skipped?.length) { dup++; markInLibrary(f.sourceUrl); }
                else fail++;
            } catch {
                fail++;
            }
            setProgress(p => ({ ...p, done: p.done + 1 }));
        }
        setProgress(null);
        const skippedBefore = selectedItems.length - todo.length;
        notify({
            message: [
                `Сохранено: ${ok}`,
                dup + skippedBefore ? `уже было: ${dup + skippedBefore}` : null,
                fail ? `ошибок: ${fail}` : null,
            ].filter(Boolean).join(' · '),
            type: fail ? 'warning' : 'success',
        });
        if (!fail) onClear();
    };

    return (
        <div className="booru-bulk-bar">
            <span className="bbb-count"><i className="bi bi-check2-square" /> {selectedItems.length}</span>
            {selectedItems.length < totalCount && (
                <button className="bbb-link" onClick={onSelectAll} title="Выделить все показанные (Ctrl+A)">Все ({totalCount})</button>
            )}
            <span className="bbb-sep" />

            {progress ? (
                <span className="bbb-progress">
                    <i className="bi bi-arrow-repeat spin" /> Сохраняю {progress.done} / {progress.total}
                    <span className="bbb-bar"><span style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></span>
                </span>
            ) : (
                <>
                    <label className="bbb-check" title="Сохранить вместе с тегами поста">
                        <input type="checkbox" checked={withTags} onChange={e => setWithTags(e.target.checked)} /> с тегами
                    </label>
                    <div className="bbb-save">
                        <button className="btn btn-sm btn-primary" disabled={!fresh.length} onClick={() => setPicking(v => !v)}
                                title={!fresh.length ? 'Все выбранные уже в библиотеке' : ''}>
                            <i className="bi bi-download me-1" />
                            В библиотеку{fresh.length !== selectedItems.length ? ` (${fresh.length})` : ''}
                        </button>
                        {picking && (
                            <>
                                <div className="bulk-move-backdrop" onMouseDown={() => setPicking(false)} />
                                <div className="bbb-picker">
                                    <CollectionTreeSelect value={null} onSelect={save} onClose={() => setPicking(false)} />
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}

            <button className="bbb-close" onClick={onClear} title="Снять выделение (Esc)" disabled={!!progress}>
                <i className="bi bi-x-lg" />
            </button>
        </div>
    );
};

export default BooruBulkBar;
