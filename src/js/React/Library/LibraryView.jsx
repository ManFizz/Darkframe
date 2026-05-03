import React, {useCallback, useEffect, useState} from 'react';
import CollectionTree, {SPECIAL} from './CollectionTree';
import ImportButton from './ImportButton';
import MetadataPanel from './MetadataPanel';
import LibraryFilters from './LibraryFilters';
import {useLibraryItems} from '../../Hooks/useLibraryItems';
import {useLibraryFilter} from '../../Hooks/useLibraryFilter';
import BulkActionBar from "./BulkActionBar";
import useSelection from "../../Hooks/useSelection";
import LibraryService from "../../Services/LibraryService"
import LibraryGallery from "../PageBuilders/LibraryGallery";

const LibraryView = () => {
    const [selectedCollection, setSelectedCollection] = useState(SPECIAL.ALL);
    const [selectedFile, setSelectedFile] = useState(null);
    const [panelOpen, setPanelOpen] = useState(false);

    const { items, reload, updateItem, deleteItem } = useLibraryItems(
        selectedCollection === SPECIAL.ALL
            ? undefined
            : selectedCollection === SPECIAL.UNCATEGORIZED
                ? null
                : selectedCollection
    );

    const {
        filters, filtered,
        update, addTag, removeTag, reset,
    } = useLibraryFilter(items);

    const { selected, selectedItems, toggle, selectAll, clear, isSelected } = useSelection(filtered);

    const [orderedItems, setOrderedItems] = useState([]);
    useEffect(() => {
        setOrderedItems(filtered);
    }, [filtered]);

    const handleReordered = useCallback((reordered) => {
        setOrderedItems(reordered);
    }, []);

    const handleFileClick = useCallback((file, e) => {
        if (e?.ctrlKey || e?.shiftKey || e?.metaKey) {
            toggle(file.uniqueId, e);
        } else if (selected.size > 0) {
            toggle(file.uniqueId, e);
        } else {
            setSelectedFile(file);
            setPanelOpen(true);
        }
    }, [selected, toggle]);

    useEffect(() => { clear(); }, [selectedCollection]);

    const handleUpdated = useCallback(async (idOrAction, data) => {
        if (idOrAction === 'delete') {
            await deleteItem(data, true);
            setSelectedFile(null);
            setPanelOpen(false);
        } else {
            await updateItem(idOrAction, data);
            // Обновляем выбранный файл если он открыт
            if (selectedFile?.id === idOrAction) {
                setSelectedFile(prev => ({ ...prev, ...data }));
            }
        }
        await reload();
    }, [deleteItem, updateItem, selectedFile, reload]);

    const handleCollectionSelect = useCallback((id) => {
        setSelectedCollection(id);
        setSelectedFile(null);
        setPanelOpen(false);
    }, []);

    return (
        <div className="library-layout">
            <div className="library-sidebar">
                <CollectionTree
                    selectedId={selectedCollection}
                    onSelect={handleCollectionSelect}
                />
                <ImportButton
                    collectionId={selectedCollection}
                    onImported={reload}
                />
            </div>

            <div className={`library-main ${panelOpen && selected.size === 0 ? 'panel-open' : ''}`}>
            <BulkActionBar
                    selectedItems={selectedItems}
                    collections={LibraryService.getCollections()}
                    onDone={async () => { clear(); await reload(); }}
                />
                <LibraryFilters
                    filters={filters}
                    onUpdate={update}
                    onAddTag={addTag}
                    onRemoveTag={removeTag}
                    onReset={reset}
                    total={items.length}
                    filtered={filtered.length}
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
                        typeView={2}
                    />
                </div>
            </div>

            {panelOpen && selected.size === 0 && (
                <MetadataPanel
                    file={selectedFile}
                    onUpdated={handleUpdated}
                    onClose={() => setPanelOpen(false)}
                />
            )}
        </div>
    );
};

export default LibraryView;