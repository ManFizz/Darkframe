import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useCollections} from '@hooks/useCollections';
import {useLibraryStats} from "@hooks/useLibraryStats";
import {useLibraryContext} from "@/LibraryContext";

export const SPECIAL = {
    ALL: 'ALL',
    UNCATEGORIZED: 'UNCATEGORIZED',
};

// --- Контекстное меню ---
const ContextMenu = ({ x, y, node, onClose, onRename, onDelete, onCreateChild }) => {
    const ref = useRef(null);

    useEffect(() => {
        const handleClick = () => onClose();
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose]);

    return (
        <div
            ref={ref}
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

// --- Узел дерева ---
const CollectionNode = ({
                            node, selectedId, onSelect,
                            onRename, onDelete, onCreateChild,
                            depth = 0
                        }) => {
    const [isOpen, setIsOpen] = useState(true);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [contextMenu, setContextMenu] = useState(null);
    const inputRef = useRef(null);

    const hasChildren = node.children?.length > 0;
    const isSelected = selectedId === node.id;

    const startRename = useCallback(() => {
        setRenameValue(node.name);
        setIsRenaming(true);
        setTimeout(() => inputRef.current?.select(), 0);
    }, [node.name]);

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
        <div className="collection-node-wrapper">
            <div
                className={`collection-node ${isSelected ? 'active' : ''} ${isRenaming ? 'renaming' : ''}`}
                style={{ paddingLeft: 8 + depth * 16 }}
                onClick={() => !isRenaming && onSelect(node.id)}
                onContextMenu={handleContextMenu}
            >
                {/* Стрелка раскрытия */}
                <button
                    className="collection-toggle"
                    style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
                    onClick={handleToggle}
                >
                    <i className={`bi bi-chevron-${isOpen ? 'down' : 'right'}`} />
                </button>

                {/* Иконка */}
                <span className="collection-icon">
                    {node.icon || (hasChildren ? '📂' : '📁')}
                </span>

                {/* Название / инпут */}
                {isRenaming ? (
                    <input
                        ref={inputRef}
                        autoFocus
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

                {/* Счётчик детей */}
                {hasChildren && (
                    <span className="collection-count">{node.children.length}</span>
                )}

                {/* Item count badge */}
                <span className="collection-item-count">
                    {node.itemCount ?? 0}
                </span>

                {/* Кнопки действий */}
                <div className="collection-actions">
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

            {/* Дети */}
            {isOpen && hasChildren && (
                <div className="collection-children">
                    {node.children.map(child => (
                        <CollectionNode
                            key={child.id}
                            node={child}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            onRename={onRename}
                            onDelete={onDelete}
                            onCreateChild={onCreateChild}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}

            {/* Контекстное меню */}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    node={node}
                    onClose={() => setContextMenu(null)}
                    onRename={startRename}
                    onDelete={onDelete}
                    onCreateChild={onCreateChild}
                />
            )}
        </div>
    );
};

// --- Инпут создания ---
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

// --- Корневое дерево ---
const CollectionTree = ({ selectedId, onSelect }) => {
    const { tree, createCollection, updateCollection, deleteCollection } = useCollections();
    const [creating, setCreating] = useState(null); // null | { parentId }

    const { statsVersion } = useLibraryContext();
    const { totalCount, uncategorizedCount } = useLibraryStats(statsVersion);

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
            {/* Заголовок */}
            <div className="collection-tree-header">
                <span>Библиотека</span>
                <button
                    className="collection-add-btn"
                    title="Создать коллекцию"
                    onClick={() => setCreating({ parentId: null })}
                >
                    <i className="bi bi-plus" />
                </button>
            </div>

            {/* Специальные папки */}
            <div
                className={`collection-node special ${selectedId === SPECIAL.ALL ? 'active' : ''}`}
                onClick={() => onSelect(SPECIAL.ALL)}
            >
                <i className="bi bi-images collection-special-icon" />
                <span className="collection-name">Все файлы</span>
                <span className="collection-item-count">{totalCount}</span>
            </div>

            <div
                className={`collection-node special ${selectedId === SPECIAL.UNCATEGORIZED ? 'active' : ''}`}
                onClick={() => onSelect(SPECIAL.UNCATEGORIZED)}
            >
                <i className="bi bi-inbox collection-special-icon" />
                <span className="collection-name">Без коллекции</span>
                <span className="collection-item-count">{uncategorizedCount}</span>
            </div>

            <div className="collection-tree-divider" />

            {/* Дерево коллекций */}
            {tree.map(node => (
                <CollectionNode
                    key={node.id}
                    node={node}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onRename={updateCollection}
                    onDelete={handleDelete}
                    onCreateChild={(parentId) => setCreating({ parentId })}
                />
            ))}

            {/* Инпут создания корневой */}
            {creating?.parentId === null && (
                <CreateInput
                    onConfirm={(name) => handleCreate(name, null)}
                    onCancel={() => setCreating(null)}
                    placeholder="Новая коллекция..."
                />
            )}

            {/* Инпут создания вложенной — рендерится внутри дерева через портал или здесь */}
            {creating?.parentId !== null && creating !== null && (
                <CreateInput
                    parentId={creating.parentId}
                    onConfirm={(name) => handleCreate(name, creating.parentId)}
                    onCancel={() => setCreating(null)}
                    placeholder="Вложенная коллекция..."
                />
            )}
        </div>
    );
};

export default CollectionTree;