import {useCallback, useEffect, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {ThumbFile} from '@/Models/ThumbFile';
import {FILE_TYPES, SOURCE_TYPES} from '@/Constants';

export function useLibraryItems(collectionId) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const raw = await LibraryService.getItems({ collectionId });

        // Псевдо-файлы для дочерних коллекций
        const collectionThumbs = (raw.collections || []).map(col =>
            new ThumbFile({
                id:        col.id,
                title:     col.name,
                thumbUrl:  col.id,
                type:      FILE_TYPES.COLLECTION,
                remoteType: SOURCE_TYPES.LIBRARY,
                order:  1000000,
                _meta: {
                    itemCount: col.itemCount,
                    isCollection: true,
                    collectionId: col.id,
                },
            })
        );

        const thumbFiles = (raw.items || []).map(item => new ThumbFile({
            id:         item.id,
            title:      item.title || item.fileName,
            thumbUrl:   item.thumbPath,
            contentUrl: item.originalPath,
            sourceUrl:  item.sourceUrl,
            tags:       item.tags,
            width:      item.width,
            height:     item.height,
            remoteType: SOURCE_TYPES.LIBRARY,
            time:       item.importedAt,
            order:      item.order,
            rating:     item.rating,
            type:       item.mimeType.startsWith('video/') ? FILE_TYPES.VIDEO : FILE_TYPES.IMAGE,
            collectionId: item.collectionId,
        }));

        setItems([...collectionThumbs, ...thumbFiles]);
        setLoading(false);
    }, [collectionId]);

    useEffect(() => { load(); }, [load]);

    return {
        items,
        loading,
        reload: load,
        updateItem: async (id, data) => {
            await LibraryService.updateItem(id, data);
            await load();
        },
        deleteItem: async (id, deleteFile) => {
            await LibraryService.deleteItem(id, deleteFile);
            await load();
        },
    };
}