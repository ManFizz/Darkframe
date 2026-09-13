import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useDragAutoScroll} from '@hooks/library/useDragAutoScroll';
import CollectionTree, {SPECIAL} from './Collection/CollectionTree';
import ImportButton from './Import/ImportButton';
import MetadataPanel from './Metadata/MetadataPanel';
import BulkMetadataPanel from './Metadata/BulkMetadataPanel';
import {useLibraryItems} from '@hooks/library/useLibraryItems';
import BulkActionBar from "./BulkActionBar";
import useSelection from "@hooks/gallery/useSelection";
import LibraryService from "@services/LibraryService"
import LibraryGallery from "../PageBuilders/LibraryGallery";
import {FILE_TYPES} from "@/Constants";
import useCollections from "@hooks/library/useCollections"
import {useLibraryStats} from "@hooks/library/useLibraryStats";
import {useLibraryContext} from '@/LibraryContext';
import Modal from "@react/Modal/Modal";
import {notify} from '@services/NotificationService';

const LibraryView = () => {
    const [selectedCollection, setSelectedCollection] = useState(SPECIAL.NONE);
    const { filtered, setLibraryItems, refreshStats, statsVersion } = useLibraryContext();
    const { favoritesId } = useLibraryStats(statsVersion);
    const [modalFileId, setModalFileId] = useState(null);
    const galleryScrollRef = useRef(null);
    useDragAutoScroll(galleryScrollRef);

    const isTrash = selectedCollection === SPECIAL.TRASH;

    // A smart collection loads by its saved filter instead of by id.
    const smartCol = LibraryService.getCollections().find(c => c.id === selectedCollection && c.isSmart);
    const smartFilterJson = smartCol ? (smartCol.filter || '{}') : null;

    const { items, reload, deleteItem, restoreItem } = useLibraryItems(
        isTrash || smartFilterJson
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

    // `orderedItems` is what the gallery actually renders (reorders, in-place patches),
    // so selection ranges are computed against it — not the raw `filtered` list.
    const [orderedItems, setOrderedItems] = useState([]);
    useEffect(() => { setOrderedItems(filtered); }, [filtered]);

    const {
        selected, selectedItems, isSelected,
        handleSelect, toggle, range, selectAll, invert, clear,
    } = useSelection(orderedItems);

    // A single selected item drives the (editable) metadata panel; 2+ → bulk panel.
    const focused = selectedItems.length === 1 ? selectedItems[0] : null;

    const { tree } = useCollections();

    const handleFileOpen = useCallback((file) => {
        if (file.type === FILE_TYPES.IMAGE || file.type === FILE_TYPES.VIDEO) {
            setModalFileId(file.uniqueId);
        }
    }, []);

    const handleCollectionSelect = useCallback((id) => {
        setSelectedCollection(id);
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
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'a')      { e.preventDefault(); selectAll(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'i') { e.preventDefault(); invert(); }
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
                mainArray={orderedItems}
                modalUpdater={(file) => setModalFileId(file?.uniqueId || null)}
                displayFiles={orderedItems}
                onUpdated={handleUpdated}
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
                {!isTrash && !smartFilterJson && (
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
            <BulkActionBar
                    selectedItems={selectedItems}
                    collections={LibraryService.getCollections()}
                    permanent={isTrash}
                    totalCount={orderedItems.length}
                    onSelectAll={selectAll}
                    onInvert={invert}
                    onClear={clear}
                    onDone={bulkOnDone}
                />
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
                        resetKey={selectedCollection}
                    />
                </div>
            </div>
            {selectedItems.length > 1
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
