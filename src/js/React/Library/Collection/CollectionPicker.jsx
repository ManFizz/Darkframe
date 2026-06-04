import React, {useEffect, useRef, useState} from 'react';
import {useCollections} from '@hooks/library/useCollections';

const CollectionPicker = ({ currentCollectionId, mixed = false, onChange }) => {
    const { tree } = useCollections();
    const [open, setOpen] = useState(false);
    const ref             = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const flatten = (nodes, depth = 0) => nodes.flatMap(n => [
        { id: n.id, name: n.name, depth },
        ...flatten(n.children || [], depth + 1),
    ]);

    const flat    = flatten(tree);
    const current = flat.find(c => c.id === currentCollectionId);

    return (
        <div className="collection-picker" ref={ref}>
            <button
                className="collection-picker-trigger"
                onClick={() => setOpen(v => !v)}
            >
                <i className="bi bi-folder me-1" />
                <span>{mixed ? 'Разные коллекции' : (current?.name || 'Без коллекции')}</span>
                <i className="bi bi-chevron-down ms-auto" />
            </button>

            {open && (
                <div className="collection-picker-dropdown">
                    <div
                        className={`collection-picker-item ${!currentCollectionId ? 'active' : ''}`}
                        onClick={() => { onChange(null); setOpen(false); }}
                    >
                        <i className="bi bi-inbox me-2" />
                        Без коллекции
                    </div>
                    {flat.map(col => (
                        <div
                            key={col.id}
                            className={`collection-picker-item ${col.id === currentCollectionId ? 'active' : ''}`}
                            style={{ paddingLeft: 12 + col.depth * 14 }}
                            onClick={() => { onChange(col.id); setOpen(false); }}
                        >
                            <i className="bi bi-folder me-2" />
                            {col.name}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CollectionPicker;
