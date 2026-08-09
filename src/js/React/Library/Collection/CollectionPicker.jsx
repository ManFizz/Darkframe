import React, {useEffect, useRef, useState} from 'react';
import {useCollections} from '@hooks/library/useCollections';

// Remember the last collections the user assigned, so they surface first next time.
const RECENT_KEY   = 'jsg_recent_collections';
const RECENT_LIMIT = 3;

function loadRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
    catch { return []; }
}

function pushRecent(id) {
    if (!id) return loadRecent();
    const next = [id, ...loadRecent().filter(x => x !== id)].slice(0, RECENT_LIMIT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
}

const CollectionPicker = ({ currentCollectionId, mixed = false, onChange }) => {
    const { tree } = useCollections();
    const [open, setOpen]           = useState(false);
    const [recentIds, setRecentIds] = useState(loadRecent);
    const ref = useRef(null);

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
    const byId     = (id) => flat.find(c => c.id === id);
    const current = byId(currentCollectionId);

    // Assign + record. Null (uncategorized) is a valid choice but not "recent".
    const assign = (id) => {
        onChange(id);
        setRecentIds(pushRecent(id));
        setOpen(false);
    };

    // Recent collections that still exist, minus the one already assigned.
    const recentCols = recentIds
        .map(byId)
        .filter(Boolean)
        .filter(c => c.id !== currentCollectionId);

    // Quick re-assign target: the most recent collection the item isn't already in.
    const quick = recentCols[0];

    return (
        <div className="collection-picker" ref={ref}>
            <div className="collection-picker-head">
                <button
                    className="collection-picker-trigger"
                    onClick={() => setOpen(v => !v)}
                >
                    <i className="bi bi-folder me-1" />
                    <span>{mixed ? 'Разные коллекции' : (current?.name || 'Без коллекции')}</span>
                    <i className="bi bi-chevron-down ms-auto" />
                </button>
                {quick && (
                    <button
                        className="collection-picker-quick"
                        title={`Назначить в «${quick.name}»`}
                        onClick={() => assign(quick.id)}
                    >
                        <i className="bi bi-arrow-repeat" />
                    </button>
                )}
            </div>

            {open && (
                <div className="collection-picker-dropdown">
                    {recentCols.length > 0 && (
                        <>
                            <div className="collection-picker-label">Недавние</div>
                            {recentCols.map(col => (
                                <div
                                    key={`recent-${col.id}`}
                                    className="collection-picker-item"
                                    onClick={() => assign(col.id)}
                                >
                                    <i className="bi bi-clock-history me-2" />
                                    {col.name}
                                </div>
                            ))}
                            <div className="collection-picker-sep" />
                        </>
                    )}

                    <div
                        className={`collection-picker-item ${!currentCollectionId ? 'active' : ''}`}
                        onClick={() => assign(null)}
                    >
                        <i className="bi bi-inbox me-2" />
                        Без коллекции
                    </div>
                    {flat.map(col => (
                        <div
                            key={col.id}
                            className={`collection-picker-item ${col.id === currentCollectionId ? 'active' : ''}`}
                            style={{ paddingLeft: 12 + col.depth * 14 }}
                            onClick={() => assign(col.id)}
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
