import {useCallback, useEffect, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {ThumbFile} from '@/Models/ThumbFile';
import {FILE_TYPES, SOURCE_TYPES} from '@/Constants';

export function useLibraryItems(collectionId, trash = false, smartFilterJson = null) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        if (collectionId === false && !smartFilterJson) {
            setItems([]);
            return;
        }
        setLoading(true);
        const raw = smartFilterJson
            ? await LibraryService.getSmartItems(JSON.parse(smartFilterJson))
            : await LibraryService.getItems({ collectionId, trash });

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
                    childCount: col.childCount || 0,
                    previews: col.previews || [],
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
            time:       item.importedAt,
            order:      item.order,
            rating:     item.rating,
            notes:      item.notes,
            type:       item.mimeType.startsWith('video/') ? FILE_TYPES.VIDEO : FILE_TYPES.IMAGE,
            importedAt: item.importedAt,
            size:       item.size,
            deletedAt:  item.deletedAt,
            editedAt:   item.editedAt,
            editParams: item.editParams,
            thumbAt:    item.thumbAt,
            fileName:   item.fileName,
            mimeType:   item.mimeType,
            remoteType: SOURCE_TYPES.LIBRARY,
            collectionId: item.collectionId,
        }));

        setItems([...collectionThumbs, ...thumbFiles]);
        setLoading(false);
    }, [collectionId, trash, smartFilterJson]);

    useEffect(() => { load(); }, [load]);

    return {
        items,
        loading,
        reload: load,
        updateItem: async (id, data) => {
            await LibraryService.updateItem(id, data);
            await load();
        },
        deleteItem: async (id, permanent) => {
            await LibraryService.deleteItem(id, permanent);
            await load();
        },
        restoreItem: async (id) => {
            await LibraryService.restoreItem(id);
            await load();
        },
    };
}
