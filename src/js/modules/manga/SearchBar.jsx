import React, {useEffect, useMemo, useRef, useState} from 'react';
import {mangaApi} from '@/Infrastructure/Ipc';

/**
 * Search field of a manga source: filters as chips (tag / parody / artist …,
 * included or excluded) + free text, with autocomplete from the site — tags of
 * every kind with counts, matching titles, recent searches.
 *
 *   Enter — search (or take the highlighted suggestion), Shift+Enter / right
 *   click — take it as an exclusion, "-" before the word — exclusion too,
 *   Backspace in an empty field — drop the last chip, ↑ ↓ — move, Esc — close.
 */
const RECENT_KEY = 'jsg_manga_recent_q';
const loadRecent = (source) => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '{}')[source] || []; } catch { return []; } };
export function pushRecent(source, query, filters) {
    if (!query.trim() && !filters.length) return;
    try {
        const all = JSON.parse(localStorage.getItem(RECENT_KEY) || '{}');
        const key = (e) => JSON.stringify([e.query.trim(), e.filters.map(f => `${f.exclude ? '-' : ''}${f.type}:${f.name}`).sort()]);
        const entry = { query: query.trim(), filters: filters.map(({ type, name, id, exclude }) => ({ type, name, id, exclude: !!exclude })) };
        all[source] = [entry, ...(all[source] || []).filter(e => key(e) !== key(entry))].slice(0, 15);
        localStorage.setItem(RECENT_KEY, JSON.stringify(all));
    } catch { /* ignore */ }
}

export const sameFilter = (a, b) => a.type === b.type && String(a.name).toLowerCase() === String(b.name).toLowerCase();
const fmtCount = (n) => (n == null ? '' : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export const FilterChip = ({ f, label, onToggle, onRemove }) => (
    <span className={`mo-chip-f ${f.exclude ? 'ex' : ''}`} title={`${label}: ${f.name}\nКлик — ${f.exclude ? 'включить' : 'исключить'}`}>
        <button className="mo-chip-f-main" onClick={onToggle}>
            {f.exclude && <i className="bi bi-dash-circle" />}
            <span className="mo-chip-f-type">{label}</span>
            <span className="mo-chip-f-name">{f.name}</span>
        </button>
        <button className="mo-chip-f-x" onClick={onRemove} title="Убрать"><i className="bi bi-x" /></button>
    </span>
);

const SearchBar = ({ source, query, setQuery, filters, setFilters, onSearch, onOpenGallery, inputRef }) => {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [cursor, setCursor] = useState(-1);
    const req = useRef(0);
    const boxRef = useRef(null);
    const labels = useMemo(() => Object.fromEntries((source.tagGroups || []).map(g => [g.type, g.label])), [source]);
    const label = (t) => labels[t] || t;

    // What's typed is looked up as a whole (tag names have spaces: "big breasts");
    // "-" in front means "exclude".
    const text = query.trim();
    const exclude = text.startsWith('-');
    const min = source.suggestMin || 1;
    const short = text.replace(/^-/, '').length < min;   // e-hentai suggests from 2 letters

    useEffect(() => {
        if (!open) return;
        const t = text.replace(/^-/, '');
        if (!t || t.length < min) { setItems([]); setLoading(false); return; }
        const id = ++req.current;
        setLoading(true);
        const timer = setTimeout(() => {
            mangaApi.suggest(source.id, t).then(list => {
                if (id !== req.current) return;
                // One block per kind (in the order the kinds first come), titles last.
                const rows = (list || []).filter(x => x.kind !== 'tag' || !filters.some(f => sameFilter(f, x)));
                const order = [...new Set(rows.map(x => (x.kind === 'tag' ? x.type : '~gallery')))];
                rows.sort((a, b) => order.indexOf(a.kind === 'tag' ? a.type : '~gallery') - order.indexOf(b.kind === 'tag' ? b.type : '~gallery'));
                setItems(rows);
                setCursor(-1);
            }).catch(() => { if (id === req.current) setItems([]); })
                .finally(() => { if (id === req.current) setLoading(false); });
        }, 220);
        return () => clearTimeout(timer);
    }, [text, open, source.id, filters, min]);

    const recent = useMemo(() => (open && !text ? loadRecent(source.id) : []), [open, text, source.id]);
    const rows = text ? items : recent.map(r => ({ kind: 'recent', ...r }));

    useEffect(() => {
        const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    const take = (row, asExclude = false) => {
        if (!row) return;
        if (row.kind === 'gallery') { setOpen(false); onOpenGallery({ source: source.id, id: row.id, preview: { title: row.title, cover: row.cover } }); return; }
        if (row.kind === 'recent') {
            setQuery(row.query);
            setFilters(row.filters);
            setOpen(false);
            onSearch({ q: row.query, f: row.filters });
            return;
        }
        const f = { type: row.type, name: row.name, id: row.id ?? null, exclude: asExclude || exclude };
        const next = [...filters.filter(x => !sameFilter(x, f)), f];
        setFilters(next);
        setQuery('');
        setItems([]);
        onSearch({ q: '', f: next });
        inputRef.current?.focus();
    };

    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor(c => Math.min(rows.length - 1, c + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(-1, c - 1)); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && cursor >= 0 && rows[cursor]) take(rows[cursor], e.shiftKey);
            else { setOpen(false); onSearch({}); }
        }
        else if (e.key === 'Tab' && open && rows.length && text) { e.preventDefault(); take(rows[Math.max(0, cursor)], e.shiftKey); }
        else if (e.key === 'Escape') {
            if (open) { e.stopPropagation(); setOpen(false); }
            else if (query || filters.length) { setQuery(''); setFilters([]); onSearch({ q: '', f: [] }); }
        }
        else if (e.key === 'Backspace' && !query && filters.length) {
            const next = filters.slice(0, -1);
            setFilters(next);
            onSearch({ f: next });
        }
    };

    const toggle = (i) => { const next = filters.map((f, k) => (k === i ? { ...f, exclude: !f.exclude } : f)); setFilters(next); onSearch({ f: next }); };
    const remove = (i) => { const next = filters.filter((_, k) => k !== i); setFilters(next); onSearch({ f: next }); };

    // Suggestions grouped by kind, in the order the site gave them.
    let lastGroup = null;
    return (
        <div className="mo-sbar" ref={boxRef}>
            <div className={`mo-search ${open ? 'open' : ''}`} onClick={() => inputRef.current?.focus()}>
                <i className="bi bi-search" />
                {filters.map((f, i) => (
                    <FilterChip key={`${f.type}:${f.name}`} f={f} label={label(f.type)} onToggle={() => toggle(i)} onRemove={() => remove(i)} />
                ))}
                <input ref={inputRef} value={query} spellCheck={false}
                       placeholder={filters.length ? '' : source.searchHint || 'Название, теги, автор…'}
                       onChange={e => { setQuery(e.target.value); setOpen(true); }}
                       onFocus={() => setOpen(true)}
                       onKeyDown={onKeyDown} />
                {loading && <i className="bi bi-arrow-repeat spin mo-sbar-spin" />}
                {(query || filters.length > 0) && (
                    <button className="mo-search-clear" title="Очистить (Esc)" onClick={e => { e.stopPropagation(); setQuery(''); setFilters([]); onSearch({ q: '', f: [] }); }}>
                        <i className="bi bi-x" />
                    </button>
                )}
            </div>
            {open && rows.length > 0 && (
                <div className="mo-ac">
                    {rows.map((r, i) => {
                        const group = r.kind === 'recent' ? 'Недавние поиски' : r.kind === 'gallery' ? 'Манга' : label(r.type);
                        const head = group !== lastGroup ? <div className="mo-ac-head">{group}</div> : null;
                        lastGroup = group;
                        return (
                            <React.Fragment key={`${r.kind}:${r.type || ''}:${r.id || r.name || i}:${i}`}>
                                {head}
                                <div className={`mo-ac-row ${i === cursor ? 'on' : ''}`}
                                     onMouseEnter={() => setCursor(i)}
                                     onMouseDown={e => e.preventDefault()}
                                     onClick={() => take(r)}
                                     onContextMenu={e => { e.preventDefault(); if (r.kind === 'tag') take(r, true); }}>
                                    {r.kind === 'gallery' ? (
                                        <>
                                            {r.cover ? <img src={r.cover} alt="" className="mo-ac-cover" /> : <i className="bi bi-book" />}
                                            <span className="mo-ac-name">{r.title}</span>
                                            <span className="mo-ac-hint">открыть</span>
                                        </>
                                    ) : r.kind === 'recent' ? (
                                        <>
                                            <i className="bi bi-clock-history" />
                                            <span className="mo-ac-name">
                                                {r.filters.map(f => `${f.exclude ? '−' : ''}${f.name}`).concat(r.query ? [`«${r.query}»`] : []).join(' · ')}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <i className={`bi ${exclude ? 'bi-dash-circle' : 'bi-tag'}`} />
                                            <span className="mo-ac-name">{r.name}</span>
                                            {r.count != null && <span className="mo-ac-count">{fmtCount(r.count)}</span>}
                                            <span className="mo-ac-hint">{exclude ? 'исключить' : 'Shift+Enter / ПКМ — исключить'}</span>
                                        </>
                                    )}
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            )}
            {open && text && !loading && !items.length && (
                <div className="mo-ac">
                    <div className="mo-ac-empty">
                        {short ? `Подсказки по тегам — от ${min} символов; Enter ищет по тексту` : 'Подсказок нет — Enter ищет по тексту'}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchBar;
