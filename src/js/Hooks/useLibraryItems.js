import {useCallback, useEffect, useState} from 'react';
import LibraryService from '../Services/LibraryService';
import {ThumbFile} from '../Models/ThumbFile';
import {SOURCE_TYPES} from '../Constants';

export function useLibraryItems(collectionId) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const raw = await LibraryService.getItems({ collectionId });

        const thumbFiles = raw.map(item => new ThumbFile({
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
        }));

        setItems(thumbFiles);
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