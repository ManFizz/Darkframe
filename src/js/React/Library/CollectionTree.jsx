import React, {useState} from 'react';
import {useCollections} from '../../Hooks/useCollections';

const CollectionNode = ({ node, selectedId, onSelect, onRename, onDelete, depth = 0 }) => {
    const [isOpen, setIsOpen] = useState(true);
    const hasChildren = node.children?.length > 0;

    return (
        <div style={{ paddingLeft: depth * 12 }}>
            <div
                className={`collection-node ${selectedId === node.id ? 'active' : ''}`}
                onClick={() => onSelect(node.id)}
            >
                <i
                    className={`bi bi-chevron-${isOpen ? 'down' : 'right'} me-1`}
                    style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
                    onClick={(e) => { e.stopPropagation(); setIsOpen(v => !v); }}
                />
                <span>{node.icon || '📁'}</span>
                <span className="ms-1">{node.name}</span>

                <div className="collection-actions ms-auto">
                    <i
                        className="bi bi-pencil"
                        onClick={(e) => { e.stopPropagation(); onRename(node); }}
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
    const [newName, setNewName] = useState('');
    const [renaming, setRenaming] = useState(null); // { id, name }

    const handleCreate = async () => {
        if (!newName.trim()) return;
        await createCollection({ name: newName.trim() });
        setNewName('');
    };

    const handleRename = async () => {
        if (!renaming?.name.trim()) return;
        await updateCollection(renaming.id, { name: renaming.name });
        setRenaming(null);
    };

    return (
        <div className="collection-tree">
            <div className="collection-tree-header">
                <span>Коллекции</span>
                <i className="bi bi-plus" onClick={() => setNewName(' ')} />
            </div>

            {tree.map(node => (
                <CollectionNode
                    key={node.id}
                    node={node}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onRename={(node) => setRenaming({ id: node.id, name: node.name })}
                    onDelete={deleteCollection}
                />
            ))}

            {newName !== '' && (
                <div className="collection-new">
                    <input
                        autoFocus
                        value={newName.trim()}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleCreate();
                            if (e.key === 'Escape') setNewName('');
                        }}
                        placeholder="Название коллекции"
                    />
                </div>
            )}

            {renaming && (
                <div className="collection-rename">
                    <input
                        autoFocus
                        value={renaming.name}
                        onChange={e => setRenaming(r => ({ ...r, name: e.target.value }))}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleRename();
                            if (e.key === 'Escape') setRenaming(null);
                        }}
                    />
                </div>
            )}
        </div>
    );
};

export default CollectionTree;