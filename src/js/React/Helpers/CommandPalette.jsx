import React, {useEffect, useMemo, useRef, useState} from 'react';
import {getCommands, matchCommands} from '@services/commands';
import {matches} from '@services/keymap';

const RECENT_KEY = 'jsg_palette_recent';
const loadRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const pushRecent = (id) => {
    const next = [id, ...loadRecent().filter(x => x !== id)].slice(0, 6);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
};

const LIMIT = 60;

// Ctrl+K: jump to any section, collection, folder, saved search or action.
const CommandPalette = () => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const listRef = useRef(null);

    useEffect(() => {
        const onKey = (e) => {
            if (matches(e, 'app.palette')) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(v => !v);
                setQuery('');
                setActive(0);
            }
        };
        // …or from a menu (the top bar's "⋯").
        const onOpen = () => { setOpen(true); setQuery(''); setActive(0); };
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('df:openPalette', onOpen);
        return () => { document.removeEventListener('keydown', onKey, true); window.removeEventListener('df:openPalette', onOpen); };
    }, []);

    const items = useMemo(() => {
        if (!open) return [];
        const all = getCommands(query);
        if (query.trim()) return matchCommands(all, query).slice(0, LIMIT);
        // Empty query: recently used first, then everything in registration order.
        const byId = new Map(all.map(c => [c.id, c]));
        const recent = loadRecent().map(id => byId.get(id)).filter(Boolean).map(c => ({ ...c, group: 'Недавние' }));
        const rest = all.filter(c => !c.always && !recent.some(r => r.id === c.id));
        return [...recent, ...rest].slice(0, LIMIT);
    }, [open, query]);

    useEffect(() => { setActive(0); }, [query]);
    useEffect(() => {
        listRef.current?.querySelector('.cmdp-item.active')?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    if (!open) return null;

    const run = (c) => {
        setOpen(false);
        if (!c.always) pushRecent(c.id);
        // Let the palette unmount before the command changes views.
        setTimeout(() => c.run(), 0);
    };

    const onKeyDown = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(items.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) run(items[active]); }
        e.stopPropagation();   // the views' own hotkeys stay quiet while typing here
    };

    let lastGroup = null;
    return (
        <div className="cmdp-overlay" onMouseDown={() => setOpen(false)}>
            <div className="cmdp" onMouseDown={e => e.stopPropagation()}>
                <div className="cmdp-input">
                    <i aria-hidden="true" className="bi bi-search" />
                    <input autoFocus value={query} spellCheck={false}
                           placeholder="Раздел, коллекция, папка, действие…"
                           onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown} />
                    <kbd>Esc</kbd>
                </div>
                <div className="cmdp-list" ref={listRef}>
                    {items.length === 0 && <div className="cmdp-empty">Ничего не найдено</div>}
                    {items.map((c, i) => {
                        const header = c.group !== lastGroup ? c.group : null;
                        lastGroup = c.group;
                        return (
                            <React.Fragment key={`${c.group}:${c.id}`}>
                                {header && <div className="cmdp-group">{header}</div>}
                                <div className={`cmdp-item ${i === active ? 'active' : ''}`}
                                     onMouseMove={() => setActive(i)} onClick={() => run(c)}>
                                    <i aria-hidden="true" className={`bi ${c.icon || 'bi-arrow-return-right'}`} />
                                    <span className="cmdp-title">{c.title}</span>
                                    {c.hint && <span className="cmdp-hint">{c.hint}</span>}
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
                <div className="cmdp-foot"><kbd>↑↓</kbd> выбор · <kbd>Enter</kbd> выполнить · <kbd>Ctrl+K</kbd> закрыть</div>
            </div>
        </div>
    );
};

export default CommandPalette;
