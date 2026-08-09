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
    const [selectedFile, setSelectedFile] = useState(null);
    const { filtered, setLibraryItems, refreshStats, statsVersion } = useLibraryContext();
    const { favoritesId } = useLibraryStats(statsVersion);
    const [modalFileId, setModalFileId] = useState(null);
    const galleryScrollRef = useRef(null);
    useDragAutoScroll(galleryScrollRef);

    const isTrash = selectedCollection === SPECIAL.TRASH;

    const { items, reload, deleteItem, restoreItem } = useLibraryItems(
        isTrash
            ? undefined
            : selectedCollection === SPECIAL.NONE
                ? false
                : selectedCollection === SPECIAL.ALL
                    ? undefined
                    : selectedCollection === SPECIAL.UNCATEGORIZED
                        ? null
                        : selectedCollection,
        isTrash
    );

    const handleFileOpen = useCallback((file) => {
        if (file.type === FILE_TYPES.IMAGE || file.type === FILE_TYPES.VIDEO) {
            setModalFileId(file.uniqueId);
        }
    }, []);

    useEffect(() => {
        setLibraryItems(items);
    }, [items]);

    const { selected, selectedItems, toggle, selectAll, clear, isSelected } = useSelection(filtered);

    const [orderedItems, setOrderedItems] = useState([]);
    useEffect(() => {
        setOrderedItems(filtered);
    }, [filtered]);

    const { tree } = useCollections();

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

    const handleFileClick = useCallback((file, e) => {
        if (file.type === FILE_TYPES.LIBRARY) {
            handleCollectionSelect(file._meta.collectionId);
            return;
        }

        if (e?.ctrlKey || e?.shiftKey || e?.metaKey) {
            toggle(file.uniqueId, e);
        } else if (selected.size > 0) {
            toggle(file.uniqueId, e);
        } else {
            setSelectedFile(file);
        }
    }, [selected, toggle, handleCollectionSelect]);

    useEffect(() => { clear(); }, [selectedCollection]);

    const handleEmptyTrash = useCallback(async () => {
        if (!confirm('Очистить корзину? Все элементы будут удалены навсегда.')) return;
        await LibraryService.emptyTrash();
        setSelectedFile(null);
        refreshStats();
        await reload();
    }, [refreshStats, reload]);

    const handleUpdated = useCallback(async (idOrAction, data) => {
        if (idOrAction === 'delete') {
            // In the trash view "delete" means gone for good; elsewhere it's a soft delete.
            await deleteItem(data, isTrash);
            setSelectedFile(null);
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
            setSelectedFile(null);
            refreshStats();
            await reload();
        } else {
            if (selectedFile?.id === idOrAction) {
                setSelectedFile(prev =>
                    Object.assign(Object.create(Object.getPrototypeOf(prev)), prev, data)
                );
            }
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
    }, [deleteItem, restoreItem, reload, refreshStats, isTrash, selectedCollection, selectedFile]);

    const handleCollectionSelect = useCallback((id) => {
        setSelectedCollection(id);
        setSelectedFile(null);
    }, []);

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
                    }}
                    onFilesTrashed={(fileIds) => {
                        const idSet = new Set(fileIds);
                        setOrderedItems(prev => prev.filter(f => !idSet.has(f.id)));
                    }}
                />
                {!isTrash && (
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

            <div className={`library-main ${selected.size === 0 ? 'panel-open' : ''}`}>
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
                    onDone={async () => { clear(); refreshStats(); await reload(); }}
                />
                <div
                    ref={galleryScrollRef}
                    className="library-gallery"
                    onKeyDown={e => { if (e.ctrlKey && e.key === 'a') { e.preventDefault(); selectAll(); }}}
                    tabIndex={0}
                    style={{ outline: 'none' }}
                >
                    <LibraryGallery
                        items={orderedItems}
                        onReordered={handleReordered}
                        isSelected={isSelected}
                        selectedIds={selected}
                        modalUpdater={handleFileClick}
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
                    file={selectedFile}
                    onUpdated={handleUpdated}
                  />
            }
        </div>
    );
};

export default LibraryView;