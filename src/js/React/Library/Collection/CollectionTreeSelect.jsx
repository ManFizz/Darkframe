import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useCollections} from '@hooks/library/useCollections';

// Remember the last collections the user assigned, so they surface first next time.
const RECENT_KEY   = 'jsg_recent_collections';
const RECENT_LIMIT = 3;

export function loadRecentCollections() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
    catch { return []; }
}

export function pushRecentCollection(id) {
    if (!id) return loadRecentCollections();
    const next = [id, ...loadRecentCollections().filter(x => x !== id)].slice(0, RECENT_LIMIT);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
}

// Smart collections are filters, not folders — nothing can be assigned to them.
function indexTree(tree) {
    const byId = new Map();
    const walk = (nodes, parent, path) => nodes.forEach(n => {
        if (n.isSmart) return;
        const kids = (n.children || []).filter(c => !c.isSmart);
        const entry = { id: n.id, name: n.name, icon: n.icon, count: n.itemCount || 0,
                        parentId: parent, path, children: kids.map(c => c.id) };
        byId.set(n.id, entry);
        walk(kids, n.id, [...path, n.name]);
    });
    walk(tree, null, []);
    return byId;
}

const Highlight = ({ text, query }) => {
    if (!query) return text;
    const i = text.toLowerCase().indexOf(query);
    if (i < 0) return text;
    return <>{text.slice(0, i)}<mark>{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
};

const NodeIcon = ({ node }) => node.icon
    ? <span className="cts-emoji">{node.icon}</span>
    : <i className={`bi ${node.children.length ? 'bi-folder2' : 'bi-folder'}`} />;

// Searchable collapsible collection tree for "put these items into…" pickers.
// Everything starts collapsed to the top level; only the branch holding the
// current collection is opened so it's visible straight away.
const CollectionTreeSelect = ({ value, onSelect, onClose, showRecent = true, autoFocus = true }) => {
    const { tree } = useCollections();
    const byId  = useMemo(() => indexTree(tree), [tree]);
    const roots = useMemo(() => tree.filter(n => !n.isSmart).map(n => n.id), [tree]);

    const [query, setQuery]       = useState('');
    const [expanded, setExpanded] = useState(() => new Set());
    const [cursor, setCursor]     = useState(0);
    const listRef  = useRef(null);
    const q = query.trim().toLowerCase();

    // Open the ancestors of the current collection once the tree is known.
    useEffect(() => {
        const open = new Set();
        let p = byId.get(value)?.parentId;
        while (p) { open.add(p); p = byId.get(p)?.parentId; }
        if (open.size) setExpanded(prev => new Set([...prev, ...open]));
    }, [byId, value]);

    const recent = useMemo(() => showRecent
        ? loadRecentCollections().map(id => byId.get(id)).filter(c => c && c.id !== value)
        : [], [byId, value, showRecent]);

    // Flat list of visible rows: the keyboard cursor walks it top to bottom.
    const rows = useMemo(() => {
        if (q) {
            return [...byId.values()]
                .filter(c => c.name.toLowerCase().includes(q))
                .sort((a, b) => {
                    const as = a.name.toLowerCase().startsWith(q), bs = b.name.toLowerCase().startsWith(q);
                    return as === bs ? a.path.length - b.path.length : (as ? -1 : 1);
                })
                .map(c => ({ kind: 'match', key: `m${c.id}`, node: c }));
        }
        const out = recent.map(c => ({ kind: 'recent', key: `r${c.id}`, node: c }));
        out.push({ kind: 'none', key: 'none' });
        const walk = (ids, depth) => ids.forEach(id => {
            const node = byId.get(id);
            if (!node) return;
            out.push({ kind: 'node', key: `n${id}`, node, depth });
            if (expanded.has(id)) walk(node.children, depth + 1);
        });
        walk(roots, 0);
        return out;
    }, [q, byId, roots, expanded, recent]);

    // Start on the current collection (or the first match while searching).
    // Waits for the ancestor expansion above, then places the cursor once per query.
    const placed = useRef(false);
    useEffect(() => { placed.current = false; }, [q]);
    useEffect(() => {
        if (placed.current || (value != null && byId.size === 0)) return;   // tree still loading
        const i = q ? 0 : rows.findIndex(r => value === null
            ? r.kind === 'none'
            : r.kind === 'node' && r.node.id === value);
        if (i < 0 && value != null && byId.has(value)) return;   // branch not opened yet
        placed.current = true;
        setCursor(Math.max(0, i));
    }, [q, rows, value, byId]);

    useEffect(() => {
        listRef.current?.querySelector('.cts-row.cursor')?.scrollIntoView({ block: 'nearest' });
    }, [cursor]);

    const toggle = (id, force) => setExpanded(prev => {
        const next = new Set(prev);
        const open = force ?? !next.has(id);
        open ? next.add(id) : next.delete(id);
        return next;
    });

    const choose = (row) => {
        if (!row) return;
        onSelect(row.kind === 'none' ? null : row.node.id);
    };

    const onKeyDown = (e) => {
        e.stopPropagation();   // keep the viewer / gallery shortcuts out of the way
        const row = rows[cursor];
        switch (e.key) {
            case 'ArrowDown': e.preventDefault(); setCursor(c => Math.min(rows.length - 1, c + 1)); break;
            case 'ArrowUp':   e.preventDefault(); setCursor(c => Math.max(0, c - 1)); break;
            case 'ArrowRight':
                if (row?.kind === 'node' && row.node.children.length) { e.preventDefault(); toggle(row.node.id, true); }
                break;
            case 'ArrowLeft':
                if (row?.kind === 'node') {
                    e.preventDefault();
                    if (expanded.has(row.node.id)) toggle(row.node.id, false);
                    else if (row.node.parentId) setCursor(rows.findIndex(r => r.kind === 'node' && r.node.id === row.node.parentId));
                }
                break;
            case 'Enter':  e.preventDefault(); choose(row); break;
            case 'Escape': e.preventDefault(); onClose?.(); break;
        }
    };

    const expandAll = () => setExpanded(new Set([...byId.values()].filter(c => c.children.length).map(c => c.id)));
    const anyExpanded = expanded.size > 0;

    return (
        <div className="cts" onKeyDown={onKeyDown}>
            <div className="cts-search">
                <i className="bi bi-search" />
                <input
                    autoFocus={autoFocus}
                    placeholder="Найти коллекцию…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
                {query
                    ? <button className="cts-icon-btn" title="Очистить" onClick={() => setQuery('')}><i className="bi bi-x-lg" /></button>
                    : <button
                        className="cts-icon-btn"
                        title={anyExpanded ? 'Свернуть всё' : 'Развернуть всё'}
                        onClick={() => anyExpanded ? setExpanded(new Set()) : expandAll()}
                    >
                        <i className={`bi ${anyExpanded ? 'bi-arrows-collapse' : 'bi-arrows-expand'}`} />
                    </button>}
            </div>

            <div className="cts-list" ref={listRef}>
                {rows.map((row, i) => {
                    const cls = `cts-row ${i === cursor ? 'cursor' : ''}`;
                    const hover = () => setCursor(i);

                    if (row.kind === 'none') return (
                        <React.Fragment key={row.key}>
                            {recent.length > 0 && <div className="cts-label">Все коллекции</div>}
                            <div className={`${cls} ${value === null ? 'active' : ''}`} onMouseMove={hover} onClick={() => choose(row)}>
                                <span className="cts-caret" />
                                <i className="bi bi-inbox" />
                                <span className="cts-name">Без коллекции</span>
                                {value === null && <i className="bi bi-check2 cts-check" />}
                            </div>
                        </React.Fragment>
                    );

                    const n = row.node;
                    const isActive = n.id === value;

                    if (row.kind === 'recent' || row.kind === 'match') return (
                        <React.Fragment key={row.key}>
                            {row.kind === 'recent' && i === 0 && <div className="cts-label">Недавние</div>}
                            <div className={`${cls} ${isActive ? 'active' : ''}`} onMouseMove={hover} onClick={() => choose(row)}>
                                <span className="cts-caret">{row.kind === 'recent' && <i className="bi bi-clock-history" />}</span>
                                <NodeIcon node={n} />
                                <span className="cts-name">
                                    <span className="cts-title"><Highlight text={n.name} query={q} /></span>
                                    {n.path.length > 0 && <span className="cts-path">{n.path.join(' › ')}</span>}
                                </span>
                                <span className="cts-count">{n.count}</span>
                                {isActive && <i className="bi bi-check2 cts-check" />}
                            </div>
                        </React.Fragment>
                    );

                    const open = expanded.has(n.id);
                    return (
                        <div
                            key={row.key}
                            className={`${cls} ${isActive ? 'active' : ''}`}
                            style={{ paddingLeft: 6 + row.depth * 16 }}
                            onMouseMove={hover}
                            onClick={() => choose(row)}
                        >
                            <span
                                className={`cts-caret ${n.children.length ? 'has' : ''}`}
                                onClick={n.children.length ? (e) => { e.stopPropagation(); toggle(n.id); } : undefined}
                            >
                                {n.children.length > 0 && <i className={`bi bi-chevron-right ${open ? 'open' : ''}`} />}
                            </span>
                            <NodeIcon node={n} />
                            <span className="cts-name">{n.name}</span>
                            {!open && n.children.length > 0 && <span className="cts-sub" title={`Вложенных коллекций: ${n.children.length}`}>{n.children.length}</span>}
                            <span className="cts-count">{n.count}</span>
                            {isActive && <i className="bi bi-check2 cts-check" />}
                        </div>
                    );
                })}

                {q && rows.length === 0 && (
                    <div className="cts-empty">
                        <i className="bi bi-search" />
                        Ничего не найдено
                    </div>
                )}
            </div>

            <div className="cts-hint">
                <span><kbd>↑↓</kbd> выбор</span>
                <span><kbd>←→</kbd> ветка</span>
                <span><kbd>↵</kbd> применить</span>
            </div>
        </div>
    );
};

export default CollectionTreeSelect;
