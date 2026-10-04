import React, {useEffect, useMemo, useRef, useState} from 'react';
import {mangaApi} from '@/Infrastructure/Ipc';
import {sameFilter} from './SearchBar';

/**
 * Tags of a site by kind, like its own tag pages: tags, parodies, characters,
 * artists, groups, genres… Lists the site publishes are browsed (popular / by
 * name, page by page, filtered by name); the rest are searched by name.
 * Click — add as a filter, right click / "−" — as an exclusion.
 */
const fmt = (n) => (n == null ? '' : n.toLocaleString('ru'));

const TagBrowser = ({ source, filters, onAdd, onClose }) => {
    const groups = source.tagGroups || [];
    const [type, setType] = useState(groups[0]?.type);
    const group = groups.find(g => g.type === type) || groups[0];
    const [sort, setSort] = useState('popular');
    const [list, setList] = useState({ items: [], page: 0, pages: 1, hasMore: false, loading: false, error: null });
    const [q, setQ] = useState('');
    const [found, setFound] = useState(null);   // search results for not-browsable kinds / a typed name
    const req = useRef(0);

    useEffect(() => { setQ(''); setFound(null); }, [type, source.id]);

    const load = async (page = 1) => {
        if (!group?.browse) { setList({ items: [], page: 0, pages: 1, hasMore: false, loading: false, error: null }); return; }
        const id = ++req.current;
        setList(l => ({ ...l, loading: true, error: null, ...(page === 1 ? { items: [] } : {}) }));
        try {
            const r = await mangaApi.browseTags(source.id, group.type, { page, sort });
            if (id !== req.current) return;
            setList(l => ({ items: page === 1 ? r.items : [...l.items, ...r.items], page, pages: r.pages || 1, hasMore: !!r.hasMore, loading: false, error: null }));
        } catch (e) {
            if (id === req.current) setList(l => ({ ...l, loading: false, error: String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }));
        }
    };
    useEffect(() => { load(1); }, [source.id, type, sort]);   // eslint-disable-line react-hooks/exhaustive-deps

    // Names typed: browsable lists are filtered here; everything else asks the site.
    const min = source.suggestMin || 1;
    const remote = !group?.browse || (list.hasMore && q.trim().length >= 2);
    const tooShort = remote && q.trim().length > 0 && q.trim().length < min;
    useEffect(() => {
        if (!remote || !q.trim() || q.trim().length < min) { setFound(null); return; }
        const t = setTimeout(() => {
            mangaApi.suggest(source.id, q.trim(), group.type)
                .then(r => setFound((r || []).filter(x => x.kind === 'tag' && x.type === group.type)))
                .catch(() => setFound([]));
        }, 250);
        return () => clearTimeout(t);
    }, [q, remote, source.id, group?.type, min]);

    const shown = useMemo(() => {
        if (found) return found;
        const n = q.trim().toLowerCase();
        return n ? list.items.filter(t => t.name.toLowerCase().includes(n)) : list.items;
    }, [found, list.items, q]);

    const state = (t) => filters.find(f => sameFilter(f, t));

    return (
        <div className="mo-tb">
            <div className="mo-tb-head">
                <span><i className="bi bi-tags" /> Теги · {source.name}</span>
                <button className="ftb-btn" onClick={onClose} title="Закрыть"><i className="bi bi-x-lg" /></button>
            </div>
            <div className="mo-tb-tabs">
                {groups.map(g => (
                    <button key={g.type} className={g.type === group?.type ? 'on' : ''} onClick={() => setType(g.type)}>{g.label}</button>
                ))}
            </div>
            <div className="mo-tb-tools">
                <input className="form-control form-control-sm" value={q} onChange={e => setQ(e.target.value)}
                       placeholder={group?.browse ? 'Фильтр по названию' : `Найти: ${group?.label.toLowerCase() || ''}`} />
                {group?.browse && source.id === 'nhentai' && (
                    <select className="form-select form-select-sm" value={sort} onChange={e => setSort(e.target.value)}>
                        <option value="popular">Популярные</option>
                        <option value="name">По алфавиту</option>
                    </select>
                )}
            </div>
            <div className="mo-tb-list">
                {list.error && <div className="mo-empty small">{list.error}</div>}
                {!group?.browse && !q.trim() && <div className="mo-empty small">Начните вводить название — сайт не публикует полный список</div>}
                {shown.map(t => {
                    const on = state(t);
                    return (
                        <div key={`${t.type}:${t.id || t.name}`} className={`mo-tb-row ${on ? (on.exclude ? 'ex' : 'in') : ''}`}
                             onClick={() => onAdd({ type: t.type, name: t.name, id: t.id ?? null, exclude: false })}
                             onContextMenu={e => { e.preventDefault(); onAdd({ type: t.type, name: t.name, id: t.id ?? null, exclude: true }); }}
                             title="Клик — искать с этим, ПКМ — без этого">
                            <span className="mo-tb-name">{t.name}</span>
                            {t.count != null && <span className="mo-tb-count">{fmt(t.count)}</span>}
                            <button className="mo-tb-ex" title="Исключить" onClick={e => { e.stopPropagation(); onAdd({ type: t.type, name: t.name, id: t.id ?? null, exclude: true }); }}>
                                <i className="bi bi-dash" />
                            </button>
                        </div>
                    );
                })}
                {list.loading && <div className="mo-loading"><i className="bi bi-arrow-repeat spin" /> Загрузка…</div>}
                {!found && !q.trim() && list.hasMore && !list.loading && (
                    <button className="ftb-btn mo-tb-more" onClick={() => load(list.page + 1)}>
                        Ещё · стр. {list.page + 1} из {list.pages}
                    </button>
                )}
                {tooShort && <div className="mo-empty small">Введите ещё символ — сайт ищет от {min} букв</div>}
                {found && !found.length && <div className="mo-empty small">Ничего не найдено</div>}
            </div>
        </div>
    );
};

export default TagBrowser;
