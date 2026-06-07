import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useCollections} from '@hooks/library/useCollections';
import {useLibraryStats} from "@hooks/library/useLibraryStats";
import {useLibraryContext} from "@/LibraryContext";
import LibraryService from '@services/LibraryService';
import LibrarySwitcher from './LibrarySwitcher';

export const SPECIAL = {
    NONE: 'NONE',
    ALL: 'ALL',
    UNCATEGORIZED: 'UNCATEGORIZED',
};

function findNodeAndParent(tree, id, parent = null) {
    for (const node of tree) {
        if (node.id === id) return { node, parent };
        if (node.children?.length) {
            const r = findNodeAndParent(node.children, id, node);
            if (r) return r;
        }
    }
    return null;
}

function isDescendant(node, targetId) {
    if (!node?.children?.length) return false;
    for (const child of node.children) {
        if (child.id === targetId) return true;
        if (isDescendant(child, targetId)) return true;
    }
    return false;
}

const ContextMenu = ({ x, y, node, onClose, onRename, onDelete, onCreateChild }) => {
    useEffect(() => {
        const handleClick = () => onClose();
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose]);

    return (
        <div
            className="collection-context-menu"
            style={{ top: y, left: x }}
            onMouseDown={e => e.stopPropagation()}
        >
            <div className="context-menu-item" onClick={() => { onCreateChild(node.id); onClose(); }}>
                <i className="bi bi-folder-plus me-2" />
                Создать вложенную
            </div>
            <div className="context-menu-item" onClick={() => { onRename(); onClose(); }}>
                <i className="bi bi-pencil me-2" />
                Переименовать
            </div>
            <div className="context-menu-divider" />
            <div className="context-menu-item danger" onClick={() => { onDelete(node.id); onClose(); }}>
                <i className="bi bi-trash me-2" />
                Удалить
            </div>
        </div>
    );
};

const CollectionNode = ({ node, selectedId, onSelect, onRename, onDelete,
                            onCreateChild, onDropMedia, onDropCollection,
                            draggedIdRef, depth = 0 }) => {
    const [isOpen, setIsOpen]           = useState(true);
    const [isRenaming, setIsRenaming]   = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [contextMenu, setContextMenu] = useState(null);
    const [dropPosition, setDropPosition] = useState(null); // 'before' | 'inside' | 'after' | null
    const [isDragging, setIsDragging]   = useState(false);
    const inputRef = useRef(null);

    const hasChildren = node.children?.length > 0;
    const isSelected  = selectedId === node.id;

    const startRename = useCallback(() => {
        setRenameValue(node.name);
        setIsRenaming(true);
        setTimeout(() => inputRef.current?.select(), 0);
    }, [node.name]);

    const handleDragStart = (e) => {
        e.stopPropagation();
        e.dataTransfer.setData('jsg/collectionId', node.id);
        e.dataTransfer.effectAllowed = 'move';
        draggedIdRef.current = node.id;
        setIsDragging(true);
    };

    const handleDragEnd = () => {
        draggedIdRef.current = null;
        setIsDragging(false);
        setDropPosition(null);
    };

    const handleDragOver = (e) => {
        e.preventDefault(); e.stopPropagation();
        const types = e.dataTransfer.types;
        const isCollection = types.includes('jsg/collectionid');
        const isFile       = types.includes('jsg/fileid');

        if (isFile) {
            e.dataTransfer.dropEffect = 'move';
            setDropPosition('inside');
            return;
        }

        if (!isCollection) return;

        const draggedId = draggedIdRef.current;
        if (draggedId === node.id) { setDropPosition(null); return; }

        const rect  = e.currentTarget.getBoundingClientRect();
        const y     = e.clientY - rect.top;
        const ratio = y / rect.height;

        const allowAfter = !(hasChildren && isOpen);

        let pos;
        if (ratio < 0.30)                  pos = 'before';
        else if (ratio > 0.70 && allowAfter) pos = 'after';
        else                                pos = 'inside';

        e.dataTransfer.dropEffect = 'move';
        setDropPosition(pos);
    };

    const handleDragLeave = (e) => {
        e.stopPropagation();
        setDropPosition(null);
    };

    const handleDrop = (e) => {
        e.preventDefault(); e.stopPropagation();
        const pos = dropPosition;
        setDropPosition(null);

        const fileIdsRaw   = e.dataTransfer.getData('jsg/fileIds');
        const fileId       = e.dataTransfer.getData('jsg/fileId');
        const collectionId = e.dataTransfer.getData('jsg/collectionId');

        if (fileIdsRaw) {
            onDropMedia?.(JSON.parse(fileIdsRaw), node.id);
        } else if (fileId) {
            onDropMedia?.([fileId], node.id);
        }

        if (collectionId && collectionId !== node.id && pos) {
            onDropCollection?.(collectionId, node.id, pos);
        }
    };

    const commitRename = useCallback(async () => {
        const trimmed = renameValue.trim();
        if (trimmed && trimmed !== node.name) {
            await onRename(node.id, { name: trimmed });
        }
        setIsRenaming(false);
    }, [renameValue, node, onRename]);

    const handleContextMenu = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
    }, []);

    const handleToggle = useCallback((e) => {
        e.stopPropagation();
        setIsOpen(v => !v);
    }, []);

    const dropClass = dropPosition ? `drop-${dropPosition}` : '';

    return (
        <div
            className={`collection-node-wrapper ${isDragging ? 'dragging' : ''}`}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div
                className={`collection-node ${isSelected ? 'active' : ''} ${dropClass}`}
                style={{ paddingLeft: 8 + depth * 16 }}
                onClick={() => !isRenaming && onSelect(node.id)}
                onContextMenu={handleContextMenu}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <button
                    className="collection-toggle"
                    style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
                    onClick={handleToggle}
                >
                    <i className={`bi bi-chevron-${isOpen ? 'down' : 'right'}`} />
                </button>

                <span className="collection-icon">
                    {node.icon || (hasChildren ? '📂' : '📁')}
                </span>

                {isRenaming ? (
                    <input
                        ref={inputRef} autoFocus
                        className="collection-rename-input"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') setIsRenaming(false);
                            e.stopPropagation();
                        }}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <span className="collection-name">{node.name}</span>
                )}

                <span className="collection-item-count">{node.itemCount ?? 0}</span>
            </div>

            {isOpen && hasChildren && (
                <div className="collection-children">
                    {node.children.map((child) => (
                        <CollectionNode
                            key={child.id}
                            node={child}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            onRename={onRename}
                            onDelete={onDelete}
                            onCreateChild={onCreateChild}
                            onDropMedia={onDropMedia}
                            onDropCollection={onDropCollection}
                            draggedIdRef={draggedIdRef}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x} y={contextMenu.y} node={node}
                    onClose={() => setContextMenu(null)}
                    onRename={startRename}
                    onDelete={onDelete}
                    onCreateChild={onCreateChild}
                />
            )}
        </div>
    );
};

const CreateInput = ({ parentId = null, onConfirm, onCancel, placeholder }) => {
    const [value, setValue] = useState('');

    return (
        <div className="collection-create-input" style={{ paddingLeft: parentId ? 32 : 8 }}>
            <i className="bi bi-folder me-1 opacity-50" />
            <input
                autoFocus
                value={value}
                onChange={e => setValue(e.target.value)}
                onBlur={() => value.trim() ? onConfirm(value.trim()) : onCancel()}
                onKeyDown={e => {
                    if (e.key === 'Enter' && value.trim()) onConfirm(value.trim());
                    if (e.key === 'Escape') onCancel();
                    e.stopPropagation();
                }}
                placeholder={placeholder || 'Название...'}
            />
        </div>
    );
};

const SpecialFileDropTarget = ({ className, onDropFiles, children, ...rest }) => {
    const [over, setOver] = useState(false);

    const isFileDrag = (e) => e.dataTransfer.types.includes('jsg/fileid');

    return (
        <div
            {...rest}
            className={`${className} ${over ? 'drop-inside' : ''}`}
            onDragOver={e => {
                if (!isFileDrag(e)) return;
                e.preventDefault(); e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                setOver(true);
            }}
            onDragLeave={e => { e.stopPropagation(); setOver(false); }}
            onDrop={e => {
                if (!isFileDrag(e)) return;
                e.preventDefault(); e.stopPropagation();
                setOver(false);

                const fileIdsRaw = e.dataTransfer.getData('jsg/fileIds');
                const fileId     = e.dataTransfer.getData('jsg/fileId');
                if (fileIdsRaw)  onDropFiles(JSON.parse(fileIdsRaw));
                else if (fileId) onDropFiles([fileId]);
            }}
        >
            {children}
        </div>
    );
};

const CollectionTree = ({ selectedId, onSelect, onMediaMoved }) => {
    const { tree, createCollection, updateCollection, deleteCollection, reorderCollections } = useCollections();
    const [creating, setCreating] = useState(null);
    const [treeCollapsed, setTreeCollapsed] = useState(false);
    const draggedIdRef = useRef(null);

    const { statsVersion, refreshStats } = useLibraryContext();
    const { total, uncategorized } = useLibraryStats(statsVersion);

    const handleDropMedia = useCallback(async (fileIds, collectionId) => {
        await Promise.all(fileIds.map(id => LibraryService.updateItem(id, { collectionId })));
        refreshStats();
        onMediaMoved?.(fileIds, collectionId);
    }, [refreshStats, onMediaMoved]);

    /**
     * Drop a collection relative to a target.
     *   position: 'before' | 'inside' | 'after'
     *   before/after  → becomes sibling of target
     *   inside        → becomes child of target
     */
    const handleDropCollection = useCallback(async (draggedId, targetId, position) => {
        if (!draggedId || !targetId || draggedId === targetId) return;

        const draggedInfo = findNodeAndParent(tree, draggedId);
        const targetInfo  = findNodeAndParent(tree, targetId);
        if (!draggedInfo || !targetInfo) return;

        if (isDescendant(draggedInfo.node, targetId)) return;

        const oldParentId = draggedInfo.parent?.id ?? null;

        let newParentId;
        let newSiblings;

        if (position === 'inside') {
            newParentId = targetId;
            const existingChildren = targetInfo.node.children || [];
            newSiblings = [
                ...existingChildren.filter(c => c.id !== draggedId),
                draggedInfo.node,
            ];
        } else {
            newParentId = targetInfo.parent?.id ?? null;
            const targetSiblings = targetInfo.parent ? targetInfo.parent.children : tree;
            const filtered = targetSiblings.filter(s => s.id !== draggedId);
            const targetIdx = filtered.findIndex(s => s.id === targetId);
            const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
            newSiblings = [
                ...filtered.slice(0, insertIdx),
                draggedInfo.node,
                ...filtered.slice(insertIdx),
            ];
        }

        if (oldParentId !== newParentId) {
            await updateCollection(draggedId, { parentId: newParentId });
        }

        const orderUpdates = newSiblings.map((s, i) => ({ id: s.id, order: i }));
        if (orderUpdates.length > 0) {
            await reorderCollections(orderUpdates);
        }
    }, [tree, updateCollection, reorderCollections]);

    const handleCreate = useCallback(async (name, parentId = null) => {
        await createCollection({ name, parentId });
        setCreating(null);
    }, [createCollection]);

    const handleDelete = useCallback(async (id) => {
        if (!confirm('Удалить коллекцию? Файлы останутся без коллекции.')) return;
        await deleteCollection(id);
    }, [deleteCollection]);

    return (
        <div className="collection-tree">
            <LibrarySwitcher />

            <div className="collection-tree-header">
                <button className="collection-tree-collapse-btn"
                        onClick={() => setTreeCollapsed(v => !v)}
                        title={treeCollapsed ? 'Развернуть' : 'Свернуть'}
                >
                    <i className={`bi bi-chevron-${treeCollapsed ? 'right' : 'down'}`} />
                </button>
                <span>Коллекции</span>
                <button className="collection-add-btn" title="Создать коллекцию"
                        onClick={() => setCreating({ parentId: null })}>
                    <i className="bi bi-plus" />
                </button>
            </div>

            <div className={`collection-node special ${selectedId === SPECIAL.ALL ? 'active' : ''}`}
                 onClick={() => onSelect(SPECIAL.ALL)}>
                <i className="bi bi-images collection-special-icon" />
                <span className="collection-name">Все файлы</span>
                <span className="collection-item-count">{total}</span>
            </div>

            <SpecialFileDropTarget
                className={`collection-node special ${selectedId === SPECIAL.UNCATEGORIZED ? 'active' : ''}`}
                onClick={() => onSelect(SPECIAL.UNCATEGORIZED)}
                onDropFiles={fileIds => handleDropMedia(fileIds, null)}
                title="Перетащите сюда файл, чтобы убрать его из коллекции"
            >
                <i className="bi bi-inbox collection-special-icon" />
                <span className="collection-name">Без коллекции</span>
                <span className="collection-item-count">{uncategorized}</span>
            </SpecialFileDropTarget>

            <div className="collection-tree-divider" />

            {!treeCollapsed && (
                <>
                    {tree.map((node) => (
                        <CollectionNode
                            key={node.id}
                            node={node}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            onRename={updateCollection}
                            onDelete={handleDelete}
                            onCreateChild={(parentId) => setCreating({ parentId })}
                            onDropMedia={handleDropMedia}
                            onDropCollection={handleDropCollection}
                            draggedIdRef={draggedIdRef}
                        />
                    ))}
                    {creating?.parentId === null && (
                        <CreateInput onConfirm={n => handleCreate(n, null)}
                                     onCancel={() => setCreating(null)} placeholder="Новая коллекция..." />
                    )}
                    {creating !== null && creating.parentId !== null && (
                        <CreateInput parentId={creating.parentId}
                                     onConfirm={n => handleCreate(n, creating.parentId)}
                                     onCancel={() => setCreating(null)} placeholder="Вложенная коллекция..." />
                    )}
                </>
            )}
        </div>
    );
};

export default CollectionTree;
