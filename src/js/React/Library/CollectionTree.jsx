import React, {useState} from 'react';
import {useCollections} from '../../Hooks/useCollections';

export const SPECIAL = {
    ALL:      'ALL',      // все файлы
    UNCATEGORIZED: 'UNCATEGORIZED', // без коллекции
};

const CollectionNode = ({ node, selectedId, onSelect, onRename, onDelete, depth = 0 }) => {
    const [isOpen, setIsOpen] = useState(true);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');

    const hasChildren = node.children?.length > 0;

    const startRename = (e) => {
        e.stopPropagation();
        setRenameValue(node.name);
        setIsRenaming(true);
    };

    const commitRename = async () => {
        if (renameValue.trim() && renameValue !== node.name) {
            await onRename(node.id, { name: renameValue.trim() });
        }
        setIsRenaming(false);
    };

    return (
        <div style={{ paddingLeft: depth * 12 }}>
            <div
                className={`collection-node ${selectedId === node.id ? 'active' : ''}`}
                onClick={() => !isRenaming && onSelect(node.id)}
            >
                <i
                    className={`bi bi-chevron-${isOpen ? 'down' : 'right'} me-1`}
                    style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
                    onClick={(e) => { e.stopPropagation(); setIsOpen(v => !v); }}
                />
                <span>{node.icon || '📁'}</span>

                {isRenaming ? (
                    <input
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
                    <span className="ms-1">{node.name}</span>
                )}

                <div className="collection-actions ms-auto">
                    <i
                        className="bi bi-pencil"
                        onClick={startRename}
                    />
                    <i
                        className="bi bi-trash"
                        onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
                    />
                </div>
            </div>

            {isOpen && hasChildren && node.children.map(child => (
                <CollectionNode
                    key={child.id}
                    node={child}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onRename={onRename}
                    onDelete={onDelete}
                    depth={depth + 1}
                />
            ))}
        </div>
    );
};

const CollectionTree = ({ selectedId, onSelect }) => {
    const { tree, createCollection, updateCollection, deleteCollection } = useCollections();
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');

    const handleCreate = async () => {
        if (!newName.trim()) return;
        await createCollection({ name: newName.trim() });
        setNewName('');
        setIsCreating(false);
    };

    return (
        <div className="collection-tree">
            <div className="collection-tree-header">
                <span>Коллекции</span>
                <i className="bi bi-plus" onClick={() => setIsCreating(true)} />
            </div>

            <div
                className={`collection-node ${selectedId === SPECIAL.ALL ? 'active' : ''}`}
                onClick={() => onSelect(SPECIAL.ALL)}
            >
                <i className="bi bi-images me-1" />
                <span>Все файлы</span>
            </div>

            <div
                className={`collection-node ${selectedId === SPECIAL.UNCATEGORIZED ? 'active' : ''}`}
                onClick={() => onSelect(SPECIAL.UNCATEGORIZED)}
            >
                <i className="bi bi-inbox me-1" />
                <span>Без коллекции</span>
            </div>

            <div className="collection-tree-divider" />

            {tree.map(node => (
                <CollectionNode
                    key={node.id}
                    node={node}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onRename={updateCollection}
                    onDelete={deleteCollection}
                />
            ))}

            {isCreating && (
                <div className="collection-new">
                    <input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onBlur={() => { setIsCreating(false); setNewName(''); }}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleCreate();
                            if (e.key === 'Escape') { setIsCreating(false); setNewName(''); }
                        }}
                        placeholder="Название коллекции"
                    />
                </div>
            )}
        </div>
    );
};

export default CollectionTree;