import React from 'react';
import Thumb from '@react/Thumb/Thumb';
import {useItemReorder} from '@hooks/useItemReorder';

const LibraryGallery = ({ items, onReordered, isSelected, modalUpdater, typeView = 2, onFileOpen }) => {
    const { draggedId, overId, onDragStart, onDragOver, onDrop, onDragEnd } =
        useItemReorder(items, onReordered);

    return (
        <div className={`gallery-view-${typeView}`}>
            {items.map(file => (
                <div
                    key={file.uniqueId}
                    className={`
                        thumb-drag-wrapper
                        ${draggedId === file.uniqueId ? 'dragging' : ''}
                        ${overId === file.uniqueId ? 'drag-over' : ''}
                    `}
                    draggable
                    onDragStart={e => onDragStart(e, file.uniqueId)}
                    onDragOver={e => onDragOver(e, file.uniqueId)}
                    onDrop={e => onDrop(e, file.uniqueId)}
                    onDragEnd={onDragEnd}
                >
                    <Thumb
                        file={file}
                        modalUpdater={modalUpdater}
                        isModal={false}
                        isSelected={isSelected?.(file.uniqueId)}
                        onDoubleClick={onFileOpen ? () => onFileOpen(file) : undefined}
                    />
                </div>
            ))}
        </div>
    );
};

export default LibraryGallery;