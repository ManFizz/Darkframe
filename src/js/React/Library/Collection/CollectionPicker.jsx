import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useCollections} from '@hooks/library/useCollections';
import CollectionTreeSelect, {loadRecentCollections, pushRecentCollection} from './CollectionTreeSelect';

const flatten = (nodes, path = []) => nodes.flatMap(n => n.isSmart ? [] : [
    { id: n.id, name: n.name, path },
    ...flatten(n.children || [], [...path, n.name]),
]);

const CollectionPicker = ({ currentCollectionId, mixed = false, onChange }) => {
    const { tree } = useCollections();
    const [open, setOpen]           = useState(false);
    const [recentIds, setRecentIds] = useState(loadRecentCollections);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const flat    = useMemo(() => flatten(tree), [tree]);
    const byId    = (id) => flat.find(c => c.id === id);
    const current = byId(currentCollectionId);

    // Assign + record. Null (uncategorized) is a valid choice but not "recent".
    const assign = (id) => {
        onChange(id);
        setRecentIds(pushRecentCollection(id));
        setOpen(false);
    };

    // Quick re-assign target: the most recent collection the item isn't already in.
    const quick = recentIds.map(byId).find(c => c && c.id !== currentCollectionId);

    return (
        <div className="collection-picker" ref={ref}>
            <div className="collection-picker-head">
                <button
                    className={`collection-picker-trigger ${open ? 'open' : ''}`}
                    title={current?.path.length ? [...current.path, current.name].join(' › ') : undefined}
                    onClick={() => setOpen(v => !v)}
                >
                    <i aria-hidden="true" className={`bi ${current ? 'bi-folder' : 'bi-inbox'}`} />
                    <span>
                        {mixed ? 'Разные коллекции' : (current?.name || 'Без коллекции')}
                        {!mixed && current?.path.length > 0 && (
                            <small className="collection-picker-path">{current.path.join(' › ')}</small>
                        )}
                    </span>
                    <i aria-hidden="true" className="bi bi-chevron-down ms-auto" />
                </button>
                {quick && (
                    <button
                        className="collection-picker-quick"
                        title={`Назначить в «${quick.name}»`}
                        onClick={() => assign(quick.id)}
                    >
                        <i aria-hidden="true" className="bi bi-arrow-repeat" />
                    </button>
                )}
            </div>

            {open && (
                <div className="collection-picker-dropdown">
                    <CollectionTreeSelect
                        value={mixed ? undefined : (currentCollectionId ?? null)}
                        onSelect={assign}
                        onClose={() => setOpen(false)}
                    />
                </div>
            )}
        </div>
    );
};

export default CollectionPicker;
