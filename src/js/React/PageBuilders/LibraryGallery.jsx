import React, {useEffect, useRef, useState} from 'react';
import Thumb from '../Thumb/Thumb';
import {useItemReorder} from '@hooks/library/useItemReorder';

// The library can hold thousands of items; rendering them all at once is what made
// big collections crawl. We render a growing window instead — the first chunk, then
// more as the sentinel scrolls into view. The full `items` array still drives reorder
// (below), so drag-and-drop keeps working across the whole list.
const INITIAL = 150;
const CHUNK   = 150;

const LibraryGallery = ({ items, onReordered, isSelected, selectedIds, selectionActive, modalUpdater, onToggleSelect, typeView = 2, onFileOpen, scrollRef, resetKey, reorderable = true }) => {
    const { isDragging, overId, onDragStart, onDragOver, onDrop, onDragEnd } =
        useItemReorder(items, onReordered, selectedIds);

    const [visibleCount, setVisibleCount] = useState(INITIAL);
    const sentinelRef = useRef(null);

    // Start over only when the dataset genuinely changes (collection / filter switch),
    // not on in-place reorders or patches that merely replace the array identity.
    useEffect(() => { setVisibleCount(INITIAL); }, [resetKey]);

    // Grow the window when the sentinel nears the bottom of the scroll container.
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || visibleCount >= items.length) return;

        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) {
                    setVisibleCount(c => Math.min(c + CHUNK, items.length));
                }
            },
            { root: scrollRef?.current || null, rootMargin: '600px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [visibleCount, items.length, scrollRef]);

    return (
        <div className={`gallery-view-${typeView}`}>
            {items.slice(0, visibleCount).map(file => (
                <div
                    key={file.uniqueId}
                    className={`
                        thumb-drag-wrapper
                        ${isDragging(file.uniqueId) ? 'dragging' : ''}
                        ${overId === file.uniqueId ? 'drag-over' : ''}
                    `}
                    draggable={reorderable}
                    onDragStart={reorderable ? (e => {
                        const isMulti = selectedIds?.has(file.uniqueId) && selectedIds.size > 1;
                        if (isMulti) {
                            const draggedFileIds = items
                                .filter(f => selectedIds.has(f.uniqueId))
                                .map(f => f.id);
                            e.dataTransfer.setData('jsg/fileIds', JSON.stringify(draggedFileIds));
                        }
                        e.dataTransfer.setData('jsg/fileId', file.id);
                        e.dataTransfer.setData('jsg/reorder', 'true');
                        onDragStart(e, file.uniqueId);
                    }) : undefined}
                    onDragOver={reorderable ? (e => onDragOver(e, file.uniqueId)) : undefined}
                    onDrop={reorderable ? (e => onDrop(e, file.uniqueId)) : undefined}
                    onDragEnd={reorderable ? onDragEnd : undefined}
                >
                    <Thumb
                        file={file}
                        modalUpdater={modalUpdater}
                        isModal={false}
                        isSelected={isSelected?.(file.uniqueId)}
                        selectionActive={selectionActive}
                        onToggleSelect={onToggleSelect}
                        onOpen={onFileOpen}
                    />
                </div>
            ))}
            {/* Full-row sentinel: when it scrolls into view, render the next chunk. */}
            <div ref={sentinelRef} style={{ flexBasis: '100%', width: '100%', height: 1 }} aria-hidden="true" />
        </div>
    );
};

export default LibraryGallery;
