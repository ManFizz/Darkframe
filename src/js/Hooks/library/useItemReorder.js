import {useCallback, useRef, useState} from 'react';
import {libraryApi} from '@/Infrastructure/Ipc';

export function useItemReorder(items, onReordered, selectedIds) {
    const [draggedIds, setDraggedIds] = useState(new Set());
    const [overId, setOverId] = useState(null);
    const saveTimeout = useRef(null);

    const onDragStart = useCallback((e, id) => {
        // Dragging one of several selected items drags them all.
        const ids = (selectedIds?.has(id) && selectedIds.size > 1)
            ? new Set(selectedIds)
            : new Set([id]);

        setDraggedIds(ids);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    }, [selectedIds]);

    const isDragging = useCallback((id) => draggedIds.has(id), [draggedIds]);

    const onDragOver = useCallback((e, id) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!draggedIds.has(id)) setOverId(id);
    }, [draggedIds]);

    const onDrop = useCallback((e, targetId) => {
        e.preventDefault();
        if (!draggedIds.size || draggedIds.has(targetId)) return;
        if (!e.dataTransfer.getData('jsg/reorder')) return;

        // The dragged block keeps its order and goes in at the target's place.
        const draggedItems = items.filter(f => draggedIds.has(f.uniqueId));
        const remaining = items.filter(f => !draggedIds.has(f.uniqueId));

        const toIdx = remaining.findIndex(f => f.uniqueId === targetId);
        if (toIdx === -1) return;

        remaining.splice(toIdx, 0, ...draggedItems);

        setDraggedIds(new Set());
        setOverId(null);

        onReordered(remaining);

        clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
            libraryApi.reorderItems(remaining.map(f => f.id));
        }, 500);
    }, [draggedIds, items, onReordered]);

    const onDragEnd = useCallback(() => {
        setDraggedIds(new Set());
        setOverId(null);
    }, []);

    return { isDragging, overId, onDragStart, onDragOver, onDrop, onDragEnd };
}
