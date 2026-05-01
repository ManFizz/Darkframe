import {useEffect, useState} from 'react';
import LibraryService from '../Services/LibraryService';

export function useCollections() {
    const [tree, setTree] = useState(LibraryService.getTree());
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        LibraryService.loadCollections().then(() => {
            setTree(LibraryService.getTree());
        });

        return LibraryService.subscribe(() => {
            setTree(LibraryService.getTree());
        });
    }, []);

    return {
        tree,
        loading,
        createCollection: async (data) => {
            setLoading(true);
            await LibraryService.createCollection(data);
            setLoading(false);
        },
        updateCollection: (id, data) => LibraryService.updateCollection(id, data),
        deleteCollection: (id) => LibraryService.deleteCollection(id),
    };
}