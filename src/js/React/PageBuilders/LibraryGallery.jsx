import React from 'react';
import Thumb from '../Thumb/Thumb';
import {useItemReorder} from '@hooks/library/useItemReorder';

const LibraryGallery = ({ items, onReordered, isSelected, selectedIds, modalUpdater, typeView = 2, onFileOpen }) => {
    const { isDragging, overId, onDragStart, onDragOver, onDrop, onDragEnd } =
        useItemReorder(items, onReordered, selectedIds);

    return (
        <div className={`gallery-view-${typeView}`}>
            {items.map(file => (
                <div
                    key={file.uniqueId}
                    className={`
                        thumb-drag-wrapper
                        ${isDragging(file.uniqueId) ? 'dragging' : ''}
                        ${overId === file.uniqueId ? 'drag-over' : ''}
                    `}
                    draggable
                    onDragStart={e => {
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
                    }}
                    onDragOver={e => onDragOver(e, file.uniqueId)}
                    onDrop={e => onDrop(e, file.uniqueId)}
                    onDragEnd={onDragEnd}
                >
                    <Thumb
                        file={file}
                        modalUpdater={modalUpdater}
                        isModal={false}
                        isSelected={isSelected?.(file.uniqueId)}
                        onOpen={onFileOpen}
                    />
                </div>
            ))}
        </div>
    );
};

export default LibraryGallery;