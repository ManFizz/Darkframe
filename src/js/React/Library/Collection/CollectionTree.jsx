import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useCollections} from '@hooks/library/useCollections';
import {useLibraryStats} from "@hooks/library/useLibraryStats";
import {useLibraryContext} from "@/LibraryContext";
import LibraryService from '@services/LibraryService';

export const SPECIAL = {
    ALL: 'ALL',
    UNCATEGORIZED: 'UNCATEGORIZED',
};

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
                            onCreateChild, onDropMedia, onDropReorder,
                            onMoveUp, onMoveDown, canMoveUp, canMoveDown, depth = 0
                                                                    }) => {
    const [isOpen, setIsOpen] = useState(true);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [contextMenu, setContextMenu] = useState(null);
    const inputRef = useRef(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const hasChildren = node.children?.length > 0;
    const isSelected = selectedId === node.id;

    const startRename = useCallback(() => {
        setRenameValue(node.name);
        setIsRenaming(true);
        setTimeout(() => inputRef.current?.select(), 0);
    }, [node.name]);

    const handleDragStart = (e) => {
        e.stopPropagation();
        e.dataTransfer.setData('jsg/collectionId', node.id);
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
    };

    const handleDragEnd = () => setIsDragging(false);

    const handleDragOver = (e) => {
        e.preventDefault(); e.stopPropagation();
        const isCollection = e.dataTransfer.types.includes('jsg/collectionid');
        const isFile       = e.dataTransfer.types.includes('jsg/fileid');
        if (isCollection || isFile) {
            e.dataTransfer.dropEffect = 'move';
            setIsDragOver(true);
        }
    };

    const handleDragLeave = (e) => {
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault(); e.stopPropagation();
        setIsDragOver(false);

        const fileId       = e.dataTransfer.getData('jsg/fileId');
        const collectionId = e.dataTransfer.getData('jsg/collectionId');

        if (fileId) onDropMedia?.(fileId, node.id);
        if (collectionId && collectionId !== node.id)
            onDropReorder?.(collectionId, node.id);
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

    return (
        <div
            className={`collection-node-wrapper ${isDragging ? 'dragging' : ''}`}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div
                className={`collection-node ${isSelected ? 'active' : ''} ${isDragOver ? 'drop-target' : ''}`}
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

                <div className="collection-actions">
                    <button
                        className="collection-action-btn"
                        title="Вверх"
                        disabled={!canMoveUp}
                        onClick={e => { e.stopPropagation(); onMoveUp?.(node.id); }}
                    >
                        <i className="bi bi-chevron-up" />
                    </button>
                    <button
                        className="collection-action-btn"
                        title="Вниз"
                        disabled={!canMoveDown}
                        onClick={e => { e.stopPropagation(); onMoveDown?.(node.id); }}
                    >
                        <i className="bi bi-chevron-down" />
                    </button>
                    <button
                        className="collection-action-btn"
                        title="Создать вложенную"
                        onClick={e => { e.stopPropagation(); onCreateChild(node.id); }}
                    >
                        <i className="bi bi-folder-plus" />
                    </button>
                    <button
                        className="collection-action-btn"
                        title="Переименовать"
                        onClick={e => { e.stopPropagation(); startRename(); }}
                    >
                        <i className="bi bi-pencil" />
                    </button>
                    <button
                        className="collection-action-btn danger"
                        title="Удалить"
                        onClick={e => { e.stopPropagation(); onDelete(node.id); }}
                    >
                        <i className="bi bi-trash" />
                    </button>
                </div>
            </div>

            {isOpen && hasChildren && (
                <div className="collection-children">
                    {node.children.map((child, idx) => (
                        <CollectionNode
                            key={child.id}
                            node={child}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            onRename={onRename}
                            onDelete={onDelete}
                            onCreateChild={onCreateChild}
                            onDropMedia={onDropMedia}
                            onDropReorder={onDropReorder}
                            onMoveUp={onMoveUp}
                            onMoveDown={onMoveDown}
                            canMoveUp={idx > 0}
                            canMoveDown={idx < node.children.length - 1}
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

const CollectionTree = ({ selectedId, onSelect, onMediaMoved }) => {
    const { tree, createCollection, updateCollection, deleteCollection, reorderCollections } = useCollections();
    const [creating, setCreating] = useState(null);
    const [treeCollapsed, setTreeCollapsed] = useState(false);

    const { statsVersion, refreshStats } = useLibraryContext();
    const { total, uncategorized } = useLibraryStats(statsVersion);

    const handleDropReorder = useCallback(async (draggedId, targetId) => {
        await updateCollection(draggedId, { parentId: targetId });
    }, [updateCollection]);

    const handleDropMedia = useCallback(async (fileId, collectionId) => {
        await LibraryService.updateItem(fileId, { collectionId });
        refreshStats();
        onMediaMoved?.(fileId, collectionId);
    }, [refreshStats, onMediaMoved]);

    const handleCreate = useCallback(async (name, parentId = null) => {
        await createCollection({ name, parentId });
        setCreating(null);
    }, [createCollection]);

    const handleDelete = useCallback(async (id) => {
        if (!confirm('Удалить коллекцию? Файлы останутся без коллекции.')) return;
        await deleteCollection(id);
    }, [deleteCollection]);

    const findSiblings = (nodes, id) => {
        for (const node of nodes) {
            const idx = node.children?.findIndex(c => c.id === id);
            if (idx !== undefined && idx > -1) return { siblings: node.children, idx };
            if (node.children?.length) {
                const found = findSiblings(node.children, id);
                if (found) return found;
            }
        }

        const idx = nodes.findIndex(n => n.id === id);
        if (idx > -1) return { siblings: nodes, idx };
        return null;
    };

    const handleMoveUp = useCallback(async (id) => {
        const result = findSiblings(tree, id);
        if (!result || result.idx === 0) return;

        const { siblings, idx } = result;
        const updates = siblings.map((s, i) => {
            if (i === idx - 1) return { id: s.id, order: (siblings[idx].order ?? idx) };
            if (i === idx)     return { id: s.id, order: (siblings[idx - 1].order ?? idx - 1) };
            return null;
        }).filter(Boolean);

        await reorderCollections(updates);
    }, [tree, reorderCollections]);

    const handleMoveDown = useCallback(async (id) => {
        const result = findSiblings(tree, id);
        if (!result || result.idx === result.siblings.length - 1) return;

        const { siblings, idx } = result;
        const updates = siblings.map((s, i) => {
            if (i === idx)     return { id: s.id, order: (siblings[idx + 1].order ?? idx + 1) };
            if (i === idx + 1) return { id: s.id, order: (siblings[idx].order ?? idx) };
            return null;
        }).filter(Boolean);

        await reorderCollections(updates);
    }, [tree, reorderCollections]);

    return (
        <div className="collection-tree">
            <div className="collection-tree-header">
                <button className="collection-tree-collapse-btn"
                        onClick={() => setTreeCollapsed(v => !v)}
                        title={treeCollapsed ? 'Развернуть' : 'Свернуть'}
                >
                    <i className={`bi bi-chevron-${treeCollapsed ? 'right' : 'down'}`} />
                </button>
                <span>Библиотека</span>
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

            <div className={`collection-node special ${selectedId === SPECIAL.UNCATEGORIZED ? 'active' : ''}`}
                 onClick={() => onSelect(SPECIAL.UNCATEGORIZED)}>
                <i className="bi bi-inbox collection-special-icon" />
                <span className="collection-name">Без коллекции</span>
                <span className="collection-item-count">{uncategorized}</span>
            </div>

            <div className="collection-tree-divider" />

            {!treeCollapsed && (
                <>
                    {tree.map((node, idx) => (
                        <CollectionNode
                            key={node.id}
                            node={node}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            onRename={updateCollection}
                            onDelete={handleDelete}
                            onCreateChild={(parentId) => setCreating({ parentId })}
                            onDropMedia={handleDropMedia}
                            onDropReorder={handleDropReorder}
                            onMoveUp={handleMoveUp}
                            onMoveDown={handleMoveDown}
                            canMoveUp={idx > 0}
                            canMoveDown={idx < tree.length - 1}
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
