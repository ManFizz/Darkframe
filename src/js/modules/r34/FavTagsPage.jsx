import React, {useEffect, useMemo, useRef, useState} from 'react';
import {currentR34Source} from './R34Controller';
import {buildQueryString, normTag, runSearch, setQuery, setView} from './booruQuery';
import {TAG_KINDS, rememberKinds, useTagKinds} from './tagKinds';
import {loadPreview, previewCache} from './previewQueue';
import {fetchTagKinds, fetchTagSuggestions} from '@controllers/TagsController';
import useFavoriteTags from '@hooks/useFavoriteTags';
import {notify} from '@services/NotificationService';
import {cachedMediaUrl} from '@/Infrastructure/MediaCache';
import {FILE_TYPES, SOURCE_TYPES} from '@/Constants';

/**
 * "Избранные теги": every favourite tag of the site as a card with its newest
 * posts — like the saved searches page. One filter applies to all of them
 * (score from, rating, order, tags to leave out), and the cards can be grouped by
 * the tag's kind (artist, character, …) with groups folded away like the date
 * groups of the library.
 */
const FILTER_KEY = 'jsg_favtags_filter';        // { [source]: { minScore, rating, sort, exclude: [], group } }
const SEEN_KEY = 'jsg_favtags_seen';            // { `${source}|${query}`: total when last opened }
const COLLAPSED_KEY = 'jsg_favtags_collapsed';  // { [source]: [kind] }
const DEFAULT_FILTER = { minScore: 0, rating: 'any', sort: 'new', exclude: [], group: true };
const SCORES = [0, 10, 50, 100, 500];

const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; } };
const writeJson = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* full */ } };
const fmt = (n) => (n == null ? '—' : n.toLocaleString('ru-RU'));
const plural = (n) => { const d = n % 10, h = n % 100; return d === 1 && h !== 11 ? 'тег' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'тега' : 'тегов'; };

function usePerSource(key, source, fallback) {
    const [value, setValue] = useState(() => readJson(key)[source] ?? fallback);
    useEffect(() => { setValue(readJson(key)[source] ?? fallback); }, [source]);   // eslint-disable-line react-hooks/exhaustive-deps
    const save = (next) => {
        setValue(prev => {
            const v = typeof next === 'function' ? next(prev) : next;
            writeJson(key, { ...readJson(key), [source]: v });
            return v;
        });
    };
    return [value, save];
}

// The query of one tag under the shared filter.
const queryFor = (tag, f) => ({
    tags: [tag, ...(f.exclude || []).filter(e => e !== tag).map(e => `-${e}`)],
    minScore: f.minScore || 0, sort: f.sort || 'new', rating: f.rating || 'any',
});

// ─── One tag ──────────────────────────────────────────────────────────────────
const TagCard = ({ tag, kind, filter, source, refreshToken, onRemove, showKind }) => {
    const q = queryFor(tag, filter);
    const query = buildQueryString(q);
    const key = `${source}|${query}`;
    const [preview, setPreview] = useState(previewCache.get(key) || null);
    const [loading, setLoading] = useState(false);
    const [seen, setSeen] = useState(() => readJson(SEEN_KEY)[key]);
    const ref = useRef(null);

    const load = (force) => {
        setLoading(true);
        loadPreview(key, query, force).then(res => { setPreview(res); setLoading(false); });
    };
    // A new filter → another query: start over, fetch once on screen.
    useEffect(() => {
        setPreview(previewCache.get(key) || null);
        setSeen(readJson(SEEN_KEY)[key]);
        if (previewCache.has(key)) return;
        const el = ref.current;
        const io = new IntersectionObserver(([hit]) => {
            if (hit.isIntersecting) { io.disconnect(); load(false); }
        }, { rootMargin: '300px' });
        io.observe(el);
        return () => io.disconnect();
    }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (refreshToken) load(true); }, [refreshToken]);   // eslint-disable-line react-hooks/exhaustive-deps

    const total = preview?.total ?? null;
    const fresh = total != null && seen != null ? Math.max(0, total - seen) : 0;

    const open = (openRemoteId) => {
        if (total != null) writeJson(SEEN_KEY, { ...readJson(SEEN_KEY), [key]: total });
        setQuery(q);
        runSearch(null, { openRemoteId });
    };

    return (
        <div ref={ref} className="svs-card fvt-card">
            <div className="svs-head">
                <div className="svs-query" onClick={() => open()} title={`Открыть поиск: ${query}`}>
                    <div className="svs-tags">
                        <span className={`svs-tag kind-${kind} fvt-name`}>{tag}</span>
                        {showKind && kind !== 'unknown' && <span className="fvt-kind">{TAG_KINDS[kind]?.label}</span>}
                    </div>
                </div>
                <div className="svs-stats">
                    <span className="svs-total" title="Постов с этим фильтром">{loading && total == null ? '…' : fmt(total)}</span>
                    {fresh > 0 && <span className="svs-new" title="С прошлого открытия">+{fmt(fresh)} новых</span>}
                </div>
                <div className="svs-actions">
                    <button className="svs-btn primary" onClick={() => open()} title="Открыть поиск"><i className="bi bi-search" /> Открыть</button>
                    <button className="svs-btn" onClick={() => load(true)} title="Обновить превью"><i className={`bi bi-arrow-clockwise ${loading ? 'spin' : ''}`} /></button>
                    <button className="svs-btn" onClick={onRemove} title="Убрать из избранного"><i className="bi bi-star-fill fvt-star" /></button>
                </div>
            </div>
            <div className="svs-strip">
                {!preview ? Array.from({ length: 8 }, (_, i) => <div key={i} className="svs-thumb skel" />)
                    : preview.error ? <div className="svs-strip-msg err"><i className="bi bi-exclamation-triangle" /> {preview.error}</div>
                    : !preview.items.length ? <div className="svs-strip-msg">Ничего не найдено{filter.minScore || filter.exclude?.length ? ' с этим фильтром' : ''}</div>
                    : <>
                        {preview.items.map(p => (
                            <button key={p.uniqueId} className="svs-thumb" onClick={() => open(p.remoteId)} title={`#${p.remoteId}${p.score != null ? ` · ★ ${p.score}` : ''}`}>
                                <img src={cachedMediaUrl(p.thumbUrl)} alt="" loading="lazy" draggable={false} />
                                {p.type === FILE_TYPES.VIDEO && <span className="svs-play"><i className="bi bi-play-fill" /></span>}
                            </button>
                        ))}
                        {total > preview.items.length && (
                            <button className="svs-thumb more" onClick={() => open()}>
                                <span>ещё</span><b>{fmt(total - preview.items.length)}</b><i className="bi bi-arrow-right" />
                            </button>
                        )}
                    </>}
            </div>
        </div>
    );
};

// ─── The shared filter ────────────────────────────────────────────────────────
const FilterBar = ({ filter, setFilter, source }) => {
    const [ex, setEx] = useState('');
    const addExclude = () => {
        const t = normTag(ex).replace(/^-/, '');
        if (t && !filter.exclude.includes(t)) setFilter(f => ({ ...f, exclude: [...f.exclude, t] }));
        setEx('');
    };
    const active = filter.minScore > 0 || filter.rating !== 'any' || filter.sort !== 'new' || filter.exclude.length > 0;
    return (
        <div className="fvt-filter">
            <div className="fvt-filter-row">
                <span className="fvt-filter-title"><i className="bi bi-funnel" /> Для всех тегов</span>
                <label className="fvt-field" title="Только посты с оценкой не ниже">
                    <span>score от</span>
                    <input type="number" min="0" step="10" value={filter.minScore || ''} placeholder="0"
                           onChange={e => setFilter(f => ({ ...f, minScore: Math.max(0, Number(e.target.value) || 0) }))} />
                </label>
                <span className="fvt-presets">
                    {SCORES.map(s => (
                        <button key={s} className={filter.minScore === s ? 'on' : ''} onClick={() => setFilter(f => ({ ...f, minScore: s }))}>{s ? `${s}+` : 'любой'}</button>
                    ))}
                </span>
                <label className="fvt-field">
                    <span>рейтинг</span>
                    <select value={filter.rating} onChange={e => setFilter(f => ({ ...f, rating: e.target.value }))}>
                        <option value="any">любой</option>
                        <option value="safe">safe</option>
                        <option value="questionable">questionable</option>
                        <option value="explicit">explicit</option>
                    </select>
                </label>
                <label className="fvt-field">
                    <span>порядок</span>
                    <select value={filter.sort} onChange={e => setFilter(f => ({ ...f, sort: e.target.value }))}>
                        <option value="new">новые</option>
                        <option value="score">лучшие</option>
                        <option value="random">случайные</option>
                    </select>
                </label>
                {active && <button className="svs-btn" onClick={() => setFilter(f => ({ ...DEFAULT_FILTER, group: f.group }))}>Сбросить</button>}
            </div>
            <div className="fvt-filter-row">
                <span className="fvt-field-label"><i className="bi bi-slash-circle" /> без тегов</span>
                {filter.exclude.map(t => (
                    <span key={t} className="svs-tag ex fvt-ex">
                        {t}
                        <i className="bi bi-x" onClick={() => setFilter(f => ({ ...f, exclude: f.exclude.filter(x => x !== t) }))} title="Убрать" />
                    </span>
                ))}
                <input className="fvt-ex-input" value={ex} placeholder="тег, Enter" onChange={e => setEx(e.target.value)}
                       onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') addExclude(); }} onBlur={() => ex.trim() && addExclude()} />
            </div>
            {source === SOURCE_TYPES.DANBOORU && filter.exclude.length > 0 && (
                <div className="fvt-note"><i className="bi bi-info-circle" /> Danbooru без входа ищет не больше чем по 2 тегам — исключения могут не сработать.</div>
            )}
        </div>
    );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
const FavTagsPage = ({ source }) => {
    const { favoriteTags, addFavTag, removeFavTag } = useFavoriteTags();
    const [filter, setFilterRaw] = usePerSource(FILTER_KEY, source, DEFAULT_FILTER);
    const f = { ...DEFAULT_FILTER, ...filter };
    const setFilter = (fn) => setFilterRaw(prev => fn({ ...DEFAULT_FILTER, ...prev }));
    const [collapsedList, setCollapsed] = usePerSource(COLLAPSED_KEY, source, []);
    const collapsed = useMemo(() => new Set(collapsedList), [collapsedList]);
    const [refreshToken, setRefreshToken] = useState(0);
    const [search, setSearch] = useState('');
    const [, bump] = useState(0);

    // Unique by name, in the user's order.
    const tags = useMemo(() => favoriteTags
        .filter((t, i, all) => t.remote_type === source && all.findIndex(x => x.remote_type === source && x.tag === t.tag) === i)
        .map(t => t.tag), [favoriteTags, source]);
    const kindOf = useTagKinds(tags);

    // Kinds the local tag base doesn't know yet are asked from the site: R34 by
    // its tag API (also saved to the tag base), the others by their tag
    // suggestions, one at a time.
    useEffect(() => {
        if (!f.group) return;
        const unknown = tags.filter(t => kindOf(t) === 'unknown');
        if (!unknown.length) return;
        let stop = false;
        if (source === SOURCE_TYPES.R34) {
            fetchTagKinds(unknown.slice(0, 80), source).then(found => {
                if (stop || !found.length) return;
                rememberKinds(found);
                bump(n => n + 1);
            }).catch(() => {});
            return () => { stop = true; };
        }
        (async () => {
            for (const t of unknown.slice(0, 60)) {
                if (stop) return;
                const list = await fetchTagSuggestions(t, source).catch(() => []);
                const hit = (list || []).find(s => (s.value || s.name) === t);
                if (hit?.type != null) { rememberKinds([{ name: t, type: hit.type }]); bump(n => n + 1); }
                await new Promise(r => setTimeout(r, 300));
            }
        })();
        return () => { stop = true; };
    }, [tags.join(' '), f.group, source]);   // eslint-disable-line react-hooks/exhaustive-deps

    const q = search.trim().toLowerCase();
    const shown = tags.filter(t => !q || t.includes(q));
    const groups = useMemo(() => {
        if (!f.group) return [{ kind: null, tags: shown }];
        const by = new Map();
        shown.forEach(t => { const k = kindOf(t); if (!by.has(k)) by.set(k, []); by.get(k).push(t); });
        return [...by.entries()]
            .sort((a, b) => (TAG_KINDS[a[0]]?.order ?? 99) - (TAG_KINDS[b[0]]?.order ?? 99))
            .map(([kind, list]) => ({ kind, tags: list }));
    }, [shown.join(' '), f.group, kindOf]);   // eslint-disable-line react-hooks/exhaustive-deps

    const toggleGroup = (kind) => setCollapsed(prev => (prev.includes(kind) ? prev.filter(k => k !== kind) : [...prev, kind]));
    const refreshAll = () => {
        for (const k of [...previewCache.keys()]) if (k.startsWith(`${source}|`)) previewCache.delete(k);
        setRefreshToken(v => v + 1);
    };
    const remove = (tag) => {
        removeFavTag(tag, source);
        notify({ message: `«${tag}» убран из избранного`, type: 'info', duration: 8000, action: { label: 'Вернуть', onClick: () => addFavTag(tag, source) } });
    };

    const card = (t) => <TagCard key={t} tag={t} kind={kindOf(t)} filter={f} source={source} refreshToken={refreshToken} onRemove={() => remove(t)} showKind={!f.group} />;

    return (
        <div className="svs-page fvt-page">
            <div className="svs-page-head">
                <button className="svs-btn" onClick={() => setView('search')} title="Назад к результатам"><i className="bi bi-arrow-left" /></button>
                <div>
                    <div className="svs-page-title"><i className="bi bi-star-fill" /> Избранные теги</div>
                    <div className="svs-page-sub">{currentR34Source?.name} · {tags.length} {plural(tags.length)}</div>
                </div>
                <span className="svs-spacer" />
                {tags.length > 6 && <input className="fvt-search" placeholder="Найти тег…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.stopPropagation()} />}
                <label className="fvt-group-toggle" title="Разложить по типу: художники, персонажи, …">
                    <input type="checkbox" checked={f.group} onChange={e => setFilter(x => ({ ...x, group: e.target.checked }))} />
                    <span>По типу</span>
                </label>
                {tags.length > 0 && <button className="svs-btn" onClick={refreshAll}><i className="bi bi-arrow-clockwise" /> Обновить все</button>}
            </div>

            {tags.length > 0 && <FilterBar filter={f} setFilter={setFilter} source={source} />}

            {tags.length === 0 ? (
                <div className="booru-empty">
                    <i className="bi bi-star" />
                    <div className="be-title">Избранных тегов пока нет</div>
                    <div className="be-sub">Добавь тег в блоке «Избранные теги» слева или звёздочкой у тега поста — здесь появятся свежие посты по каждому.</div>
                </div>
            ) : (
                <div className="svs-list">
                    {groups.map(g => (g.kind == null ? g.tags.map(card) : (
                        <React.Fragment key={g.kind}>
                            <div className={`gallery-divider fvt-divider ${collapsed.has(g.kind) ? 'collapsed' : ''}`} role="button" tabIndex={0}
                                 aria-expanded={!collapsed.has(g.kind)} title={collapsed.has(g.kind) ? 'Показать группу' : 'Скрыть группу'}
                                 onClick={() => toggleGroup(g.kind)}
                                 onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(g.kind); } }}>
                                <i className="bi bi-chevron-down gallery-divider-caret" />
                                <span className={`gallery-divider-label fvt-kind-label kind-${g.kind}`}>{TAG_KINDS[g.kind]?.label || 'Прочие'}</span>
                                <span className="gallery-divider-line" />
                                <span className="gallery-divider-count">
                                    {collapsed.has(g.kind) && <span className="gallery-divider-hidden">скрыто · </span>}
                                    {g.tags.length} {plural(g.tags.length)}
                                </span>
                            </div>
                            {!collapsed.has(g.kind) && g.tags.map(card)}
                        </React.Fragment>
                    )))}
                    {!shown.length && <div className="svs-strip-msg">Ничего не найдено</div>}
                </div>
            )}
        </div>
    );
};

export default FavTagsPage;
