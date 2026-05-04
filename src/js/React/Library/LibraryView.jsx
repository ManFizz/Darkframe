import React, {useCallback, useEffect, useMemo, useState} from 'react';
import CollectionTree, {SPECIAL} from './CollectionTree';
import ImportButton from './ImportButton';
import MetadataPanel from './MetadataPanel';
import {useLibraryItems} from '@hooks/useLibraryItems';
import BulkActionBar from "./BulkActionBar";
import useSelection from "@hooks/useSelection";
import LibraryService from "@services/LibraryService"
import LibraryGallery from "../PageBuilders/LibraryGallery";
import {FILE_TYPES} from "@/Constants";
import useCollections from "@hooks/useCollections"
import {useLibraryContext} from '@/LibraryContext';
import Modal from "@react/Modal/Modal";

const LibraryView = () => {
    const [selectedCollection, setSelectedCollection] = useState(SPECIAL.ALL);
    const [selectedFile, setSelectedFile] = useState(null);
    const { filtered, setLibraryItems } = useLibraryContext();
    const [modalFileId, setModalFileId] = useState(null);

    const { items, reload, updateItem, deleteItem } = useLibraryItems(
        selectedCollection === SPECIAL.ALL
            ? undefined
            : selectedCollection === SPECIAL.UNCATEGORIZED
                ? null
                : selectedCollection
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
    }, [selectedCollection, tree]);

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

    const handleUpdated = useCallback(async (idOrAction, data) => {
        if (idOrAction === 'delete') {
            await deleteItem(data, true);
            setSelectedFile(null);
        } else {
            await updateItem(idOrAction, data);
            if (selectedFile?.id === idOrAction) {
                setSelectedFile(prev => ({ ...prev, ...data }));
            }
        }
        await reload();
    }, [deleteItem, updateItem, selectedFile, reload]);

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
            />
            <div className="library-sidebar">
                <CollectionTree
                    selectedId={selectedCollection}
                    onSelect={handleCollectionSelect}
                />
                <ImportButton
                    collectionId={
                        selectedCollection === SPECIAL.ALL || selectedCollection === SPECIAL.UNCATEGORIZED
                            ? null
                            : selectedCollection
                    }
                    collectionName={currentCollectionName}
                    onImported={reload}
                />
            </div>

            <div className={`library-main ${selected.size === 0 ? 'panel-open' : ''}`}>
            <BulkActionBar
                    selectedItems={selectedItems}
                    collections={LibraryService.getCollections()}
                    onDone={async () => { clear(); await reload(); }}
                />
                <div
                    className="library-gallery"
                    onKeyDown={e => { if (e.ctrlKey && e.key === 'a') { e.preventDefault(); selectAll(); }}}
                    tabIndex={0}
                    style={{ outline: 'none' }}
                >
                    <LibraryGallery
                        items={orderedItems}
                        onReordered={handleReordered}
                        isSelected={isSelected}
                        modalUpdater={handleFileClick}
                        onFileOpen={handleFileOpen}
                        typeView={2}
                    />
                </div>
            </div>
            <MetadataPanel
                file={selectedFile}
                onUpdated={handleUpdated}
                onClose={() => setPanelOpen(false)}
            />
        </div>
    );
};

export default LibraryView;