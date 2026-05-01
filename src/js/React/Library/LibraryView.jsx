import React, {useCallback, useState} from 'react';
import CollectionTree from './CollectionTree';
import ImportButton from './ImportButton';
import MetadataPanel from './MetadataPanel';
import LibraryFilters from './LibraryFilters';
import {useLibraryItems} from '../../Hooks/useLibraryItems';
import {useLibraryFilter} from '../../Hooks/useLibraryFilter';
import Gallery from '../PageBuilders/Gallery';

const LibraryView = () => {
    const [selectedCollection, setSelectedCollection] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [panelOpen, setPanelOpen] = useState(false);

    const { items, reload, updateItem, deleteItem } = useLibraryItems(selectedCollection);

    const {
        filters, filtered,
        update, addTag, removeTag, reset,
    } = useLibraryFilter(items);

    const handleFileClick = useCallback((file) => {
        setSelectedFile(file);
        setPanelOpen(true);
    }, []);

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

            <div className={`library-main ${panelOpen ? 'panel-open' : ''}`}>
                <LibraryFilters
                    filters={filters}
                    onUpdate={update}
                    onAddTag={addTag}
                    onRemoveTag={removeTag}
                    onReset={reset}
                    total={items.length}
                    filtered={filtered.length}
                />

                <div className="library-gallery">
                    <Gallery
                        displayArray={filtered}
                        typeView={2}
                        modalFileId={selectedFile?.uniqueId || null}
                        modalUpdater={handleFileClick}
                        onScrollEnd={() => {}}
                    />
                </div>
            </div>

            {panelOpen && (
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