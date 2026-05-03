import {useCallback, useRef, useState} from 'react';
import {libraryApi} from '../Infrastructure/Ipc';

export function useItemReorder(items, onReordered) {
    const [draggedId, setDraggedId] = useState(null);
    const [overId, setOverId] = useState(null);
    const saveTimeout = useRef(null);

    const onDragStart = useCallback((e, id) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    }, []);

    const onDragOver = useCallback((e, id) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (id !== draggedId) setOverId(id);
    }, [draggedId]);

    const onDrop = useCallback((e, targetId) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) return;

        const ids = items.map(f => f.uniqueId);
        const fromIdx = ids.indexOf(draggedId);
        const toIdx = ids.indexOf(targetId);

        const reordered = [...items];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);

        setDraggedId(null);
        setOverId(null);

        onReordered(reordered);

        clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
            libraryApi.reorderItems(reordered.map(f => f.id));
        }, 500);
    }, [draggedId, items, onReordered]);

    const onDragEnd = useCallback(() => {
        setDraggedId(null);
        setOverId(null);
    }, []);

    return { draggedId, overId, onDragStart, onDragOver, onDrop, onDragEnd };
}