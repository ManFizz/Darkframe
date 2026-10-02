import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import CollectionTree, {SPECIAL} from './Collection/CollectionTree';
import ImportButton from './Import/ImportButton';
import MetadataPanel from './Metadata/MetadataPanel';
import BulkMetadataPanel from './Metadata/BulkMetadataPanel';
import {useLibraryItems} from '@hooks/library/useLibraryItems';
import BulkActionBar from "./BulkActionBar";
import QuickFilters from "./Filters/QuickFilters";
import useSelection from "@hooks/gallery/useSelection";
import LibraryService from "@services/LibraryService"
import LibraryGallery from "../PageBuilders/LibraryGallery";
import {getViewPrefs, setViewPref, useViewPref} from '@services/viewPrefs';
import {collectionRequests} from '@services/commands';
import {runVisualSearch, useVisualSearch} from '@services/visualSearch';
import VisualSearchHeader from './VisualSearchHeader';
import {FILE_TYPES, SOURCE_TYPES} from "@/Constants";
import {ThumbFile} from "@/Models/ThumbFile";
import useCollections from "@hooks/library/useCollections"
import {useLibraryStats} from "@hooks/library/useLibraryStats";
import {useLibraryContext} from '@/LibraryContext';
import Modal from "@react/Modal/Modal";
import {notify} from '@services/NotificationService';
import {libraryApi} from '@/Infrastructure/Ipc';
import {readLibraryManga} from '@services/mangaLibrary';
import {undoLast, redoLast} from '@services/undo';
import {useCommands} from '@services/commands';
import {matches} from '@services/keymap';

// Human labels for the history section selector (keys are SOURCE_TYPES / remoteType).
const SECTION_LABELS = {
    [SOURCE_TYPES.LIBRARY]:   'Библиотека',
    [SOURCE_TYPES.R34]:       'R34',
    [SOURCE_TYPES.GELBOORU]:  'Gelbooru',
    [SOURCE_TYPES.REALBOORU]: 'Realbooru',
    [SOURCE_TYPES.DANBOORU]:  'Danbooru',
    [SOURCE_TYPES.FOLDER]:    'Папки',
    [SOURCE_TYPES.FAVORITE]:  'Избранное',
};
const sectionLabel = (s) => SECTION_LABELS[s] || `Секция ${s}`;

const LibraryView = () => {
    const [selectedCollection, setSelectedCollection] = useState(() => {
        const requested = collectionRequests.take();   // Ctrl+K from another tab
        if (requested) {
            if (requested !== SPECIAL.VISUAL) setViewPref('lastCollection', requested);
            return requested;
        }
        const { restoreSession, lastCollection } = getViewPrefs();
        return (restoreSession && lastCollection) || SPECIAL.NONE;
    });
    useEffect(() => collectionRequests.subscribe((id) => {
        if (id === SPECIAL.VISUAL) setModalFileId(null);   // results replace the viewer
        setSelectedCollection(id);
        if (id !== SPECIAL.VISUAL) setViewPref('lastCollection', id);   // results aren't a place to return to
    }), []);
    const { filtered, filters, update, setLibraryItems, refreshStats, statsVersion } = useLibraryContext();
    const [ratingDividers] = useViewPref('ratingDividers');
    const [dateDividers] = useViewPref('dateDividers');
    const { favoritesId } = useLibraryStats(statsVersion);

    // A restored selection may point at a collection deleted since: fall back.
    useEffect(() => {
        const check = () => {
            const special = Object.values(SPECIAL).includes(selectedCollection);
            const cols = LibraryService.getCollections();
            if (special || !favoritesId || !cols.length) return;
            if (selectedCollection !== favoritesId && !cols.some(c => c.id === selectedCollection)) {
                setSelectedCollection(SPECIAL.NONE);
            }
        };
        check();
        return LibraryService.subscribe(check);
    }, [selectedCollection, favoritesId]);
    const [modalFileId, setModalFileId] = useState(null);
    const galleryScrollRef = useRef(null);

    const isTrash = selectedCollection === SPECIAL.TRASH;
    const isHistory = selectedCollection === SPECIAL.HISTORY;

    // History view: which section is shown (null = all) + the sections that have data.
    const [historySection, setHistorySection] = useState(null);
    const [historySections, setHistorySections] = useState([]);

    // A smart collection loads by its saved filter instead of by id; search by
    // picture loads its fixed, ordered list of results the same way.
    const isVisual = selectedCollection === SPECIAL.VISUAL;
    const visual = useVisualSearch();
    const smartCol = LibraryService.getCollections().find(c => c.id === selectedCollection && c.isSmart);
    const smartFilterJson = isVisual
        ? JSON.stringify({ ids: visual.results.map(r => r.id) })
        : smartCol ? (smartCol.filter || '{}') : null;
    // Where "close" on the results goes back to.
    const beforeVisual = useRef(SPECIAL.ALL);
    useEffect(() => { if (!isVisual) beforeVisual.current = selectedCollection; }, [selectedCollection, isVisual]);

    const { items, reload, deleteItem, restoreItem } = useLibraryItems(
        isHistory
            ? false                              // history is loaded separately, not from the item DB
            : isTrash || smartFilterJson
            ? undefined
            : selectedCollection === SPECIAL.NONE
                ? false
                : selectedCollection === SPECIAL.ALL
                    ? undefined
                    : selectedCollection === SPECIAL.UNCATEGORIZED
                        ? null
                        : selectedCollection,
        isTrash,
        smartFilterJson
    );

    useEffect(() => { setLibraryItems(items); }, [items]);

    // Items imported from elsewhere (API / browser extension, a batch still running)
    // show up in the open view without switching collections. Throttled: a big batch
    // refreshes the gallery every couple of seconds, not on every file.
    const reloadRef = useRef(reload);
    useEffect(() => { reloadRef.current = reload; });
    useEffect(() => {
        const onReload = () => reloadRef.current();
        window.addEventListener('df:libraryReload', onReload);
        return () => window.removeEventListener('df:libraryReload', onReload);
    }, []);

    // Slideshow of the selection / the whole view, started without opening a file first.
    const [slideSet, setSlideSet] = useState(null);   // { items, token }
    const startSlideshow = useCallback((list) => {
        const media = list.filter(f => f.type === FILE_TYPES.IMAGE || f.type === FILE_TYPES.VIDEO);
        if (!media.length) { notify({ message: 'Нечего показывать', type: 'info' }); return; }
        setSlideSet({ items: media, token: Date.now() });
        setModalFileId(media[0].uniqueId);
    }, []);
    const slideshowListRef = useRef([]);
    useEffect(() => {
        const onPlay = () => startSlideshow(slideshowListRef.current);
        window.addEventListener('df:slideshow', onPlay);
        return () => window.removeEventListener('df:slideshow', onPlay);
    }, [startSlideshow]);

    // Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) — library edits only, so this lives with the
    // library view; text fields and the image editor keep their own undo.
    useEffect(() => {
        const onKey = (e) => {
            const t = e.target;
            if (t?.closest?.('input, textarea, [contenteditable="true"]') || document.querySelector('.img-editor')) return;
            if (matches(e, 'lib.undo')) { e.preventDefault(); undoLast(); }
            else if (matches(e, 'lib.redo')) { e.preventDefault(); redoLast(); }
            else if (matches(e, 'lib.paste')) { e.preventDefault(); pasteRef.current(); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);
    useCommands('library-visual', () => [
        { id: 'vs:clip', group: 'Поиск по картинке', icon: 'bi-clipboard-image', title: 'Найти по картинке из буфера обмена', run: () => runVisualSearch({ clipboard: true }) },
        { id: 'vs:file', group: 'Поиск по картинке', icon: 'bi-image', title: 'Найти по картинке из файла…', run: () => runVisualSearch({ pick: true }) },
    ]);
    // Ctrl+V: what's on the clipboard goes into the open collection (or "no
    // collection" when a special / smart view is open).
    const pasteRef = useRef(null);
    pasteRef.current = async () => {
        const special = Object.values(SPECIAL).includes(selectedCollection) || !!smartFilterJson;
        const target = special ? null : selectedCollection;
        const where = target ? `«${LibraryService.getCollections().find(c => c.id === target)?.name || 'коллекция'}»` : '«Без коллекции»';
        const res = await libraryApi.paste(target).catch(e => ({ errors: [{ error: e.message }] }));
        const added = res?.results?.length || 0, dup = res?.skipped?.length || 0, err = res?.errors?.length || 0;
        if (!res?.kind && !added && !err) {
            notify({ message: 'В буфере нет картинки, ссылки или файлов', type: 'info' });
            return;
        }
        notify({
            message: added ? `Вставлено в ${where}: ${added}${dup ? ` · уже было: ${dup}` : ''}${err ? ` · ошибок: ${err}` : ''}`
                : dup ? 'Уже есть в библиотеке' : String(res.errors?.[0]?.error || 'Не удалось вставить').split(/\n/).pop(),
            type: added ? 'success' : err ? 'warning' : 'info',
        });
        if (added) { refreshStats(); await reloadRef.current(); }
    };

    useCommands('library-slideshow', () => [
        { id: 'paste', group: 'Библиотека', icon: 'bi-clipboard-plus', title: 'Вставить из буфера обмена в эту коллекцию', hint: 'Ctrl+V', run: () => pasteRef.current() },
        { id: 'ss:view', group: 'Библиотека', icon: 'bi-play-circle', title: 'Слайд-шоу: всё, что показано', hint: 'S в просмотрщике', run: () => startSlideshow(orderedItems) },
        ...(selectedItems.length > 1 ? [{ id: 'ss:sel', group: 'Библиотека', icon: 'bi-play-circle', title: `Слайд-шоу: выделенные (${selectedItems.length})`, run: () => startSlideshow(selectedItems) }] : []),
    ]);
    useCommands('library-undo', () => [
        { id: 'undo', group: 'Библиотека', icon: 'bi-arrow-counterclockwise', title: 'Отменить последнее действие', hint: 'Ctrl+Z', run: undoLast },
        { id: 'redo', group: 'Библиотека', icon: 'bi-arrow-clockwise', title: 'Повторить отменённое', hint: 'Ctrl+Y', run: redoLast },
    ]);
    useEffect(() => {
        let timer = null, last = 0;
        const shows = (addedTo) => {
            if (selectedCollection === SPECIAL.ALL || smartFilterJson) return true;
            if (selectedCollection === SPECIAL.UNCATEGORIZED) return addedTo.includes(null);
            return addedTo.includes(selectedCollection);
        };
        const off = LibraryService.onLibraryChanged(({ added, addedTo = [], reload }) => {
            // Undo / redo: whatever it touched, show the current state right away.
            if (reload) { reloadRef.current(); return; }
            if (!added || isTrash || isHistory || selectedCollection === SPECIAL.NONE) return;
            if (!shows(addedTo) || timer) return;
            timer = setTimeout(() => {
                timer = null;
                last = Date.now();
                reloadRef.current();
            }, Math.max(0, 2000 - (Date.now() - last)));
        });
        return () => { off(); clearTimeout(timer); };
    }, [selectedCollection, smartFilterJson, isTrash, isHistory]);

    // `orderedItems` is what the gallery actually renders (reorders, in-place patches),
    // so selection ranges are computed against it — not the raw `filtered` list.
    // In the history view it's driven by loadHistory() instead of the item DB.
    const [orderedItems, setOrderedItems] = useState([]);
    useEffect(() => { if (!isHistory) setOrderedItems(filtered); }, [filtered, isHistory]);
    // The top-bar play button shows the selection if there is one, else everything.
    useEffect(() => { slideshowListRef.current = selectedItems.length > 1 ? selectedItems : orderedItems; });

    // Load recently-viewed for the chosen section, newest first. Snapshots are rebuilt
    // into ThumbFiles so the gallery + viewer work uniformly across sources.
    const loadHistory = useCallback(async () => {
        const [rows, sections] = await Promise.all([
            LibraryService.getHistory(historySection),
            LibraryService.getHistorySections(),
        ]);
        setHistorySections(sections);
        setOrderedItems(rows.map(r => {
            const tf = new ThumbFile(r.data || {});
            tf.uniqueId  = `hist-${r.historyId}`;   // stable & unique across sections
            tf.historyId = r.historyId;
            tf.viewedAt  = r.lastViewedAt;
            tf.viewCount = r.viewCount;
            tf.section   = r.section;
            return tf;
        }));
    }, [historySection]);

    useEffect(() => { if (isHistory) loadHistory(); }, [isHistory, loadHistory]);

    const {
        selected, selectedItems, isSelected,
        handleSelect, toggle, range, selectAll, invert, clear,
    } = useSelection(orderedItems);

    // A single selected item drives the (editable) metadata panel; 2+ → bulk panel.
    const focused = selectedItems.length === 1 ? selectedItems[0] : null;

    const { tree } = useCollections();

    const handleFileOpen = useCallback((file) => {
        if (file.isManga) { readLibraryManga(file); return; }
        if (file.type === FILE_TYPES.IMAGE || file.type === FILE_TYPES.VIDEO) {
            setModalFileId(file.uniqueId);
        }
    }, []);

    const handleCollectionSelect = useCallback((id) => {
        setSelectedCollection(id);
        setViewPref('lastCollection', id);
    }, []);

    // Clicking a thumb body selects it (Explorer-style: plain = single, ctrl = toggle,
    // shift = range). Opening the viewer is the overlay button / context menu / dbl-click.
    const handleFileClick = useCallback((file, e) => {
        if (file.type === FILE_TYPES.LIBRARY) {
            handleCollectionSelect(file._meta.collectionId);
            return;
        }
        handleSelect(file.uniqueId, e || {});
    }, [handleSelect, handleCollectionSelect]);

    // Checkbox overlay: toggle (shift extends the range) without disturbing modifiers.
    const handleCheckbox = useCallback((file, e) => {
        if (file.type === FILE_TYPES.LIBRARY) return;
        if (e?.shiftKey) range(file.uniqueId);
        else toggle(file.uniqueId);
    }, [range, toggle]);

    // Selection resets whenever the collection/filter view changes.
    useEffect(() => { clear(); }, [selectedCollection, clear]);

    const currentCollectionName = useMemo(() => {
        if (selectedCollection === SPECIAL.ALL ||
            selectedCollection === SPECIAL.UNCATEGORIZED ||
            !selectedCollection) return null;

        if (selectedCollection === favoritesId) return 'Избранное';

        const findName = (nodes) => {
            for (const node of nodes) {
                if (node.id === selectedCollection) return node.name;
                if (node.children?.length) {
                    const found = findName(node.children);
                    if (found) return found;
                }
            }
            return null;
        };

        return findName(tree);
    }, [selectedCollection, tree, favoritesId]);

    const handleReordered = useCallback((reordered) => {
        setOrderedItems(reordered);
    }, []);

    const handleEmptyTrash = useCallback(async () => {
        if (!confirm('Очистить корзину? Все элементы будут удалены навсегда.')) return;
        await LibraryService.emptyTrash();
        clear();
        refreshStats();
        await reload();
    }, [refreshStats, reload, clear]);

    // Trash every selected item at once (one IPC call), with an Undo toast.
    const bulkTrash = useCallback(async () => {
        if (!selectedItems.length || isTrash) return;
        const ids = selectedItems.map(f => f.id);
        await LibraryService.deleteItems(ids, false);
        clear();
        refreshStats();
        await reload();
        notify({
            message: `Перемещено в корзину: ${ids.length}`,
            type: 'info',
            duration: 6000,
            action: {
                label: 'Отменить',
                onClick: async () => {
                    await LibraryService.restoreItems(ids);
                    refreshStats();
                    await reload();
                },
            },
        });
    }, [selectedItems, isTrash, clear, refreshStats, reload]);

    const clearCurrentHistory = useCallback(async () => {
        const scope = historySection == null ? 'всю историю' : `историю раздела «${sectionLabel(historySection)}»`;
        if (!confirm(`Очистить ${scope}?`)) return;
        await LibraryService.clearHistory(historySection);
        clear();
        await loadHistory();
    }, [historySection, clear, loadHistory]);

    const removeSelectedFromHistory = useCallback(async () => {
        const ids = selectedItems.map(f => f.historyId).filter(Boolean);
        if (!ids.length) return;
        await LibraryService.removeHistory(ids);
        clear();
        await loadHistory();
    }, [selectedItems, clear, loadHistory]);

    const handleUpdated = useCallback(async (idOrAction, data) => {
        if (idOrAction === 'delete') {
            // In the trash view "delete" means gone for good; elsewhere it's a soft delete.
            await deleteItem(data, isTrash);
            refreshStats();
            await reload();
            if (!isTrash) {
                notify({
                    message: 'Перемещено в корзину',
                    type: 'info',
                    duration: 6000,
                    action: {
                        label: 'Отменить',
                        onClick: async () => {
                            await LibraryService.restoreItem(data);
                            refreshStats();
                            await reload();
                        },
                    },
                });
            }
        } else if (idOrAction === 'restore') {
            await restoreItem(data);
            refreshStats();
            await reload();
        } else if (idOrAction === 'refresh') {
            // e.g. after an in-modal image edit — reload so the busted URLs refetch.
            await reload();
        } else {
            setOrderedItems(prev => {
                const idx = prev.findIndex(f => f.id === idOrAction);
                if (idx === -1) return prev;

                const item    = prev[idx];
                const patched = Object.assign(Object.create(Object.getPrototypeOf(item)), item, data);
                const collectionChanged = data && 'collectionId' in data && item.collectionId !== data.collectionId;

                if (!collectionChanged) {
                    return prev.map(f => f.id === idOrAction ? patched : f);
                }

                // Moved to another collection: the server drops it at the end of that
                // collection's order, so mirror that here — pull it out and, if it's
                // still on screen, re-add it last. Otherwise it just leaves the view.
                const stillVisible =
                    selectedCollection === SPECIAL.ALL           ? true
                        : selectedCollection === SPECIAL.UNCATEGORIZED ? data.collectionId === null
                            : selectedCollection === SPECIAL.TRASH     ? true
                                : data.collectionId === selectedCollection;

                const without = prev.filter(f => f.id !== idOrAction);
                return stillVisible ? [...without, patched] : without;
            });
        }
    }, [deleteItem, restoreItem, reload, refreshStats, isTrash, selectedCollection]);

    const onGalleryKeyDown = useCallback((e) => {
        if (matches(e, 'common.selectAll'))  { e.preventDefault(); selectAll(); }
        else if (matches(e, 'lib.invert'))   { e.preventDefault(); invert(); }
        else if (e.key === 'Escape' && selected.size)   { clear(); }
        else if (e.key === 'Delete' && selectedItems.length && !isTrash) { e.preventDefault(); bulkTrash(); }
    }, [selectAll, invert, clear, selected.size, selectedItems.length, isTrash, bulkTrash]);

    const bulkOnDone = useCallback(async () => {
        clear();
        refreshStats();
        await reload();
    }, [clear, refreshStats, reload]);

    return (
        <div className="library-layout">
            <Modal
                fileId={modalFileId}
                mainArray={slideSet ? slideSet.items : orderedItems}
                modalUpdater={(file) => {
                    setModalFileId(file?.uniqueId || null);
                    if (!file) setSlideSet(null);   // viewer closed: back to the whole view
                }}
                displayFiles={slideSet ? slideSet.items : orderedItems}
                onUpdated={isHistory ? undefined : handleUpdated}
                autoSlideshow={slideSet?.token || false}
            />
            <div className="library-sidebar" onDragOver={e => e.stopPropagation()}>
                <CollectionTree
                    selectedId={selectedCollection}
                    onSelect={handleCollectionSelect}
                    onMediaMoved={(fileIds, newCollectionId) => {
                        const idSet = new Set(fileIds);

                        const stillVisibleAfterMove =
                            selectedCollection === SPECIAL.ALL ? true
                                : selectedCollection === SPECIAL.UNCATEGORIZED ? newCollectionId === null
                                    : selectedCollection === SPECIAL.TRASH ? true
                                        : newCollectionId === selectedCollection;

                        // Pull the moved items out and re-append them at the end, matching
                        // the server dropping them last in the destination's order.
                        setOrderedItems(prev => {
                            const moved = [];
                            const rest = prev.filter(f => {
                                if (!idSet.has(f.id)) return true;
                                moved.push(Object.assign(Object.create(Object.getPrototypeOf(f)), f, { collectionId: newCollectionId }));
                                return false;
                            });
                            return stillVisibleAfterMove ? [...rest, ...moved] : rest;
                        });
                        clear();
                    }}
                    onFilesTrashed={(fileIds) => {
                        const idSet = new Set(fileIds);
                        setOrderedItems(prev => prev.filter(f => !idSet.has(f.id)));
                        clear();
                    }}
                />
                {!isTrash && !smartFilterJson && !isHistory && (
                    <ImportButton
                        collectionId={
                            selectedCollection === SPECIAL.ALL || selectedCollection === SPECIAL.UNCATEGORIZED
                                ? null
                                : selectedCollection
                        }
                        collectionName={currentCollectionName}
                        onImported={() => { reload(); refreshStats(); }}
                    />
                )}
            </div>

            <div className="library-main">
            {isTrash && (
                <div className="trash-toolbar">
                    <i className="bi bi-trash me-1" />
                    <span>Корзина — удалённые элементы</span>
                    <button className="btn btn-sm btn-outline-danger ms-auto" onClick={handleEmptyTrash}>
                        <i className="bi bi-trash3 me-1" />
                        Очистить корзину
                    </button>
                </div>
            )}
            {isHistory && (
                <div className="history-toolbar">
                    <i className="bi bi-clock-history history-toolbar-icon" />
                    <div className="history-sections">
                        <button
                            className={`history-sec ${historySection == null ? 'active' : ''}`}
                            onClick={() => setHistorySection(null)}
                        >
                            Все
                        </button>
                        {historySections.map(s => (
                            <button
                                key={s.section}
                                className={`history-sec ${historySection === s.section ? 'active' : ''}`}
                                onClick={() => setHistorySection(s.section)}
                            >
                                {sectionLabel(s.section)}
                                <span className="history-sec-count">{s.count}</span>
                            </button>
                        ))}
                    </div>
                    <div className="history-actions ms-auto">
                        {selectedItems.length > 0 && (
                            <button className="btn btn-sm btn-outline-secondary" onClick={removeSelectedFromHistory}>
                                <i className="bi bi-x-lg me-1" />
                                Убрать ({selectedItems.length})
                            </button>
                        )}
                        <button className="btn btn-sm btn-outline-danger" onClick={clearCurrentHistory}>
                            <i className="bi bi-trash3 me-1" />
                            Очистить
                        </button>
                    </div>
                </div>
            )}
            {isVisual && (
                <VisualSearchHeader
                    onClose={() => handleCollectionSelect(beforeVisual.current)}
                    sortedBySimilarity={filters.sortBy === 'order'}
                    onSortBySimilarity={() => update('sortBy', 'order')}
                />
            )}
            {!isHistory && <QuickFilters />}
            {!isHistory && (
                <BulkActionBar
                    selectedItems={selectedItems}
                    onSlideshow={() => startSlideshow(selectedItems)}
                    permanent={isTrash}
                    totalCount={orderedItems.length}
                    onSelectAll={selectAll}
                    onInvert={invert}
                    onClear={clear}
                    onDone={bulkOnDone}
                    onChanged={async () => { refreshStats(); await reload(); }}
                />
            )}
                <div
                    ref={galleryScrollRef}
                    className="library-gallery"
                    onKeyDown={onGalleryKeyDown}
                    tabIndex={0}
                    style={{ outline: 'none' }}
                >
                    <LibraryGallery
                        items={orderedItems}
                        onReordered={handleReordered}
                        isSelected={isSelected}
                        selectedIds={selected}
                        selectionActive={selected.size > 0}
                        modalUpdater={handleFileClick}
                        onToggleSelect={handleCheckbox}
                        onFileOpen={handleFileOpen}
                        typeView={2}
                        scrollRef={galleryScrollRef}
                        reorderable={!isHistory}
                        groupBy={isHistory ? null
                            : ratingDividers && filters.sortBy === 'rating' ? 'rating'
                            : dateDividers && filters.sortBy === 'importedAt' ? 'month'
                            : null}
                        resetKey={isHistory ? `history:${historySection ?? 'all'}` : selectedCollection}
                    />
                </div>
            </div>
            {isHistory ? (
                <div className="metadata-panel">
                    {focused ? (
                        <>
                            <div className="metadata-preview">
                                {focused.type === FILE_TYPES.VIDEO
                                    ? <video src={focused.thumbUrl} muted loop autoPlay />
                                    : <img src={focused.thumbUrl} alt={focused.title} />}
                            </div>
                            <div className="metadata-content">
                                <div className="metadata-section">
                                    <label>Раздел</label>
                                    <span className="metadata-value">{sectionLabel(focused.section)}</span>
                                </div>
                                <div className="metadata-section">
                                    <label>Название</label>
                                    <span className="metadata-value">{focused.title}</span>
                                </div>
                                <div className="metadata-section">
                                    <label>Просмотров</label>
                                    <span className="metadata-value">{focused.viewCount}</span>
                                </div>
                                {focused.viewedAt && (
                                    <div className="metadata-section">
                                        <label>Последний просмотр</label>
                                        <span className="metadata-value">
                                            {new Date(focused.viewedAt * 1000).toLocaleString('ru-RU')}
                                        </span>
                                    </div>
                                )}
                                {focused.tags?.length > 0 && (
                                    <div className="metadata-section">
                                        <label>Теги</label>
                                        <div className="remote-tags">
                                            {focused.tags.map(t => (
                                                <span key={t} className="badge tag bg-secondary">{t}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {focused.sourceUrl && (
                                    <div className="metadata-section">
                                        <label>Источник</label>
                                        <a className="btn btn-sm btn-outline-secondary"
                                           href={focused.sourceUrl} target="_blank" rel="noreferrer">
                                            <i className="bi bi-box-arrow-up-right me-1" />
                                            Открыть источник
                                        </a>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="metadata-panel-empty">
                            <i className="bi bi-clock-history" />
                            <span>Выбери элемент</span>
                        </div>
                    )}
                </div>
            ) : selectedItems.length > 1
                ? <BulkMetadataPanel
                    items={selectedItems}
                    onUpdated={reload}
                  />
                : <MetadataPanel
                    file={focused}
                    onUpdated={handleUpdated}
                  />
            }
        </div>
    );
};

export default LibraryView;
