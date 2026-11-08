import React, {useEffect, useState} from 'react';
import {currentR34Source} from './R34Controller';
import {
    clearHistory, cycleTag, getHistory, runSearch, setQuery, tagState, useBooruQuery, useSearchStatus,
} from './booruQuery';
import useFavoriteTags from '@hooks/useFavoriteTags';
import {useTagKinds} from './tagKinds';
import {SOURCE_TYPES} from '@/Constants';
import {notify} from '@services/NotificationService';
import {queryOf, useSavedSearches} from './savedSearches';
import {setView} from './booruQuery';
import {addToBlacklist, removeFromBlacklist, setShowHidden, useBlacklist} from './blacklist';
import {useCommandProvider, useCommands} from '@services/commands';
import {setHideViewed, useHideViewed} from './hideViewed';

// Posts already opened in the viewer (by the view history) drop out of the results.
const ViewedBlock = ({ source }) => {
    const { on, hiddenCount } = useHideViewed(source);
    return (
        <Block title="Просмотренные">
            <label className="form-check form-switch bsb-switch" title="Посты, которые уже открывали в просмотрщике, не показываются (по истории просмотров)">
                <input className="form-check-input" type="checkbox" checked={on} onChange={e => setHideViewed(source, e.target.checked)} />
                <span>Скрыть просмотренные</span>
                {on && hiddenCount > 0 && <span className="bsb-switch-count">скрыто {hiddenCount}</span>}
            </label>
        </Block>
    );
};

// Tags whose posts are hidden from results on this source (client-side).
const BlacklistBlock = ({ source }) => {
    const { list, showHidden, hiddenCount } = useBlacklist(source);
    const [value, setValue] = useState('');
    const add = () => {
        const tags = value.split(/[\s,]+/).filter(Boolean);
        if (!tags.length) return;
        addToBlacklist(source, tags);
        setValue('');
    };
    return (
        <Block title="Чёрный список"
               extra={hiddenCount > 0 && (
                   <button className="bsb-link" onClick={() => setShowHidden(!showHidden)}
                           title={showHidden ? 'Снова прятать' : 'Показать скрытые посты'}>
                       <i className={`bi ${showHidden ? 'bi-eye-slash' : 'bi-eye'}`} /> {showHidden ? 'прятать' : `скрыто ${hiddenCount}`}
                   </button>
               )}>
            {list.length > 0 ? (
                <div className="bsb-chips">
                    {list.map(t => (
                        <span key={t} className="bsb-tag bsb-black" title="Посты с этим тегом скрыты">
                            <span className="bsb-tag-name">{t}</span>
                            <i className="bi bi-x-lg bsb-x" title="Убрать из чёрного списка" onClick={() => removeFromBlacklist(source, t)} />
                        </span>
                    ))}
                </div>
            ) : (
                <div className="bsb-empty">Посты с этими тегами не будут показываться в результатах</div>
            )}
            <div className="bsb-add">
                <input placeholder="Тег для скрытия" value={value}
                       onChange={e => setValue(e.target.value)}
                       onKeyDown={e => { if (e.key === 'Enter') add(); }} />
                <button disabled={!value.trim()} onClick={add}><i className="bi bi-plus-lg" /></button>
            </div>
        </Block>
    );
};

const SORTS = [
    { id: 'new',    label: 'Новые',     icon: 'bi-clock' },
    { id: 'score',  label: 'Лучшие',    icon: 'bi-fire' },
    { id: 'random', label: 'Случайные', icon: 'bi-shuffle' },
];
const SCORES = [0, 10, 50, 100, 500, 1000];
const RATINGS = [
    { id: 'any',          label: 'Любой' },
    { id: 'safe',         label: 'Safe' },
    { id: 'questionable', label: 'Quest.' },
    { id: 'explicit',     label: 'Explicit' },
];

const LOGO = { [SOURCE_TYPES.R34]: 'R34', [SOURCE_TYPES.GELBOORU]: 'GB', [SOURCE_TYPES.REALBOORU]: 'RB', [SOURCE_TYPES.DANBOORU]: 'DB' };

const fmtTotal = (n) => n.toLocaleString('ru-RU');
const ago = (ms) => {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'только что';
    if (m < 60) return `${m} мин назад`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} ч назад`;
    return new Date(ms).toLocaleDateString('ru-RU');
};

const Segmented = ({ options, value, onChange }) => (
    <div className="bsb-seg">
        {options.map(o => (
            <button key={o.id} className={value === o.id ? 'active' : ''} onClick={() => onChange(o.id)}>
                {o.icon && <i className={`bi ${o.icon}`} />} {o.label}
            </button>
        ))}
    </div>
);

// Folded blocks of the sidebar (by title), remembered.
const FOLDED_KEY = 'jsg_booru_blocks_folded';
const readFolded = () => { try { return new Set(JSON.parse(localStorage.getItem(FOLDED_KEY) || '[]')); } catch { return new Set(); } };

// A sidebar block; the title folds it (`count` — shown while folded).
const Block = ({ title, extra, children, count = null }) => {
    const [folded, setFolded] = useState(() => readFolded().has(title));
    const toggle = () => {
        const all = readFolded();
        if (folded) all.delete(title); else all.add(title);
        try { localStorage.setItem(FOLDED_KEY, JSON.stringify([...all])); } catch { /* ignore */ }
        setFolded(!folded);
    };
    return (
        <div className={`bsb-block ${folded ? 'folded' : ''}`}>
            <div className="bsb-title">
                <span className="bsb-fold" role="button" tabIndex={0} onClick={toggle} title={folded ? 'Развернуть' : 'Свернуть'}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}>
                    <i className="bi bi-chevron-down bsb-fold-caret" />{title}
                    {folded && count != null && <span className="bsb-fold-count">{count}</span>}
                </span>
                {!folded && extra}
            </div>
            {!folded && children}
        </div>
    );
};

// Search sidebar for the booru sources: result summary, sort / score / rating
// modifiers, saved tags and recent searches. The tag input itself lives in the top bar.
const SectionR34 = ({ currentSource }) => {
    const q = useBooruQuery();
    const status = useSearchStatus();
    const { favoriteTags, addFavTag, removeFavTag, reorderFavTags } = useFavoriteTags();
    const [newTag, setNewTag] = useState('');
    const [customScore, setCustomScore] = useState('');
    // A click on a saved tag drives the search; × or a right click removes it (with
    // undo). Several at once: edit mode, mark → "delete (N)".
    const [editing, setEditing] = useState(false);
    const [marked, setMarked] = useState(() => new Set());

    useEffect(() => { setEditing(false); setMarked(new Set()); }, [currentSource]);
    useEffect(() => {
        if (!editing) return;
        const onKey = (e) => { if (e.key === 'Escape') { setEditing(false); setMarked(new Set()); } };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [editing]);

    const toggleMark = (tag) => setMarked(prev => {
        const next = new Set(prev);
        next.has(tag) ? next.delete(tag) : next.add(tag);
        return next;
    });

    const deleteMarked = () => {
        const removed = [...marked];
        removed.forEach(t => removeFavTag(t, currentSource));
        setMarked(new Set());
        setEditing(false);
        notify({
            message: removed.length === 1 ? `Тег «${removed[0]}» удалён из избранного` : `Удалено избранных тегов: ${removed.length}`,
            type: 'info',
            duration: 8000,
            action: { label: 'Вернуть', onClick: () => removed.forEach(t => addFavTag(t, currentSource)) },
        });
    };

    // Unique by name: a duplicated tag would give two chips the same React key.
    const savedFavs = favoriteTags.filter((t, i, all) =>
        t.remote_type === currentSource && all.findIndex(x => x.remote_type === t.remote_type && x.tag === t.tag) === i);
    // While dragging, the list is shown in the live (not yet saved) order.
    const [drag, setDrag] = useState(null);   // { tag, order: [names], dropped }
    const favs = drag
        ? [...new Set(drag.order)].map(name => savedFavs.find(f => f.tag === name)).filter(Boolean)
        : savedFavs;
    // A long list: find a tag in it (dragging shows the whole list).
    const [favFilter, setFavFilter] = useState('');
    const fq = favFilter.trim().toLowerCase();
    const shownFavs = fq && !drag ? favs.filter(f => f.tag.includes(fq)) : favs;
    // One tag out of the favourites, with an undo.
    const removeOne = (tag) => {
        removeFavTag(tag, currentSource);
        notify({ message: `«${tag}» убран из избранного`, type: 'info', duration: 6000, action: { label: 'Вернуть', onClick: () => addFavTag(tag, currentSource) } });
    };

    const onDragStart = (e, tag) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tag);
        setDrag({ tag, order: savedFavs.map(f => f.tag), dropped: false });
    };
    // Hovering another chip moves the dragged one into its slot (live preview).
    const onDragOverTag = (e, overTag) => {
        if (!drag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (overTag === drag.tag || !drag.order.includes(overTag)) return;
        setDrag(d => {
            const order = d.order.filter(t => t !== d.tag);
            if (!order.includes(overTag)) return d;
            order.splice(order.indexOf(overTag) + (d.order.indexOf(overTag) > d.order.indexOf(d.tag) ? 1 : 0), 0, d.tag);
            return { ...d, order };
        });
    };
    const onDrop = (e) => {
        if (!drag) return;
        e.preventDefault();
        const changed = drag.order.join('\n') !== savedFavs.map(f => f.tag).join('\n');
        if (changed) reorderFavTags(currentSource, drag.order);
        setDrag(null);
    };
    // Dropped outside the list (or Esc): nothing is saved.
    const onDragEnd = () => setDrag(null);
    const history = getHistory(currentSource);
    const saved = useSavedSearches(currentSource);
    const searched = status.query != null && status.source === currentSource;

    // Modifiers re-run an existing search right away; before the first search they just preset it.
    const change = (patch) => (searched ? runSearch(patch) : setQuery(patch));
    const kindOf = useTagKinds(favs.map(f => f.tag));

    useCommands('booru', () => [
        ...saved.map(s => ({
            id: `saved:${s.id}`, group: 'Сохранённые поиски', icon: 'bi-bookmark', title: s.title || s.tags || 'все посты',
            keywords: s.tags, run: () => runSearch(queryOf(s)),
        })),
        ...savedFavs.map(f => ({
            id: `favtag:${f.tag}`, group: 'Избранные теги', icon: 'bi-star', title: `Искать: ${f.tag}`,
            run: () => runSearch({ tags: [f.tag] }),
        })),
        { id: 'booru:saved-page', group: 'Сохранённые поиски', icon: 'bi-grid-3x2-gap', title: 'Страница сохранённых поисков', run: () => setView('saved') },
        { id: 'booru:favtags-page', group: 'Избранные теги', icon: 'bi-star', title: 'Страница избранных тегов', keywords: 'избранное теги', run: () => setView('favtags') },
    ]);
    useCommandProvider('booru-search', (query) => {
        const tags = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return tags.length ? [{
            id: 'booru:search', always: true, group: currentR34Source?.name || 'Поиск', icon: 'bi-search',
            title: `Искать «${tags.join(' ')}»`, run: () => runSearch({ tags }),
        }] : [];
    });

    return (
        <section className="booru-sidebar">
            <div className="bsb-head">
                <div className="bsb-source">
                    <span className="bsb-logo">{LOGO[currentSource] || '?'}</span>
                    <div>
                        <div className="bsb-name">{currentR34Source?.name}</div>
                        <div className="bsb-status">
                            {status.loading ? <><i className="bi bi-arrow-repeat spin" /> Поиск…</>
                                : status.error && searched ? <span className="err"><i className="bi bi-exclamation-triangle" /> {status.error}</span>
                                : searched ? <>{fmtTotal(status.total || 0)} постов</>
                                : 'Готов к поиску'}
                        </div>
                    </div>
                </div>
            </div>

            <Block title="Сортировка">
                <Segmented options={SORTS} value={q.sort} onChange={v => change({ sort: v })} />
            </Block>

            <Block title="Минимальный score">
                <div className="bsb-chips">
                    {SCORES.map(s => (
                        <button key={s} className={`bsb-pill ${q.minScore === s ? 'active' : ''}`} onClick={() => change({ minScore: s })}>
                            {s === 0 ? 'любой' : `${s}+`}
                        </button>
                    ))}
                    <input className="bsb-num" type="number" min={0} placeholder="…" value={customScore}
                           onChange={e => setCustomScore(e.target.value)}
                           onKeyDown={e => { if (e.key === 'Enter' && customScore !== '') change({ minScore: Math.max(0, Number(customScore) || 0) }); }} />
                </div>
            </Block>

            <Block title="Рейтинг">
                <Segmented options={RATINGS} value={q.rating} onChange={v => change({ rating: v })} />
            </Block>

            <Block title="Избранные теги" count={favs.length || null}
                   extra={favs.length > 0 && (editing
                       ? <span className="bsb-hint">выбери теги для удаления</span>
                       : <span className="bsb-extra">
                             <button className="bsb-link" onClick={() => setEditing(true)} title="Удалить избранные теги">
                                 <i className="bi bi-pencil" />
                             </button>
                             <button className={`bsb-link ${q.view === 'favtags' ? 'active' : ''}`} onClick={() => setView('favtags')} title="Страница избранных тегов: свежие посты по каждому">
                                 все <i className="bi bi-arrow-right" />
                             </button>
                         </span>)}>
                {savedFavs.length > 12 && !editing && (
                    <input className="bsb-fav-filter" placeholder={`Найти среди ${savedFavs.length}…`} value={favFilter}
                           onChange={e => setFavFilter(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setFavFilter(''); }} />
                )}
                <div className={`bsb-chips bsb-favs ${editing ? 'editing' : ''} ${drag ? 'dragging' : ''}`}
                     onDragOver={e => { if (drag) e.preventDefault(); }}
                     onDrop={onDrop}>
                    {shownFavs.map(f => {
                        const st = tagState(f.tag);
                        const isMarked = marked.has(f.tag);
                        if (editing) {
                            return (
                                <span key={f.tag}
                                      className={`bsb-tag kind-${kindOf(f.tag)} edit ${isMarked ? 'marked' : ''} ${drag?.tag === f.tag ? 'drag-src' : ''}`}
                                      draggable
                                      onDragStart={e => onDragStart(e, f.tag)}
                                      onDragOver={e => onDragOverTag(e, f.tag)}
                                      onDragEnd={onDragEnd}
                                      onClick={() => toggleMark(f.tag)}
                                      title={`${f.tag}\n${isMarked ? 'Не удалять' : 'Отметить для удаления'} · перетащи, чтобы переставить`}>
                                    <i className={`bi ${isMarked ? 'bi-check-square-fill' : 'bi-square'}`} />
                                    <span className="bsb-tag-name">{f.tag}</span>
                                </span>
                            );
                        }
                        return (
                            <span key={f.tag}
                                  className={`bsb-tag kind-${kindOf(f.tag)} ${st || ''} ${drag?.tag === f.tag ? 'drag-src' : ''}`}
                                  draggable
                                  onDragStart={e => onDragStart(e, f.tag)}
                                  onDragOver={e => onDragOverTag(e, f.tag)}
                                  onDragEnd={onDragEnd}
                                  onClick={() => cycleTag(f.tag)}
                                  onContextMenu={e => { e.preventDefault(); removeOne(f.tag); }}
                                  title={`${f.tag}\n${st === 'include' ? 'В запросе — нажми, чтобы исключить' : st === 'exclude' ? 'Исключён — нажми, чтобы убрать' : 'Нажми, чтобы добавить в запрос'} · ПКМ или × — убрать из избранного · перетащи, чтобы переставить`}>
                                <i className="bi bi-grip-vertical bsb-grip" />
                                {st === 'include' && <i className="bi bi-plus-circle-fill bsb-state" />}
                                {st === 'exclude' && <i className="bi bi-dash-circle-fill bsb-state" />}
                                <span className="bsb-tag-name">{f.tag}</span>
                                <button className="bsb-tag-x" title="Убрать из избранного"
                                        onClick={e => { e.stopPropagation(); removeOne(f.tag); }}>
                                    <i className="bi bi-x" />
                                </button>
                            </span>
                        );
                    })}
                    {!favs.length && <div className="bsb-empty">Сохраняй частые теги, чтобы добавлять их в поиск одним кликом</div>}
                </div>
                {editing ? (
                    <div className="bsb-edit-bar">
                        <button className="bsb-link" onClick={() => setMarked(marked.size === favs.length ? new Set() : new Set(favs.map(f => f.tag)))}>
                            {marked.size === favs.length ? 'снять все' : 'выбрать все'}
                        </button>
                        <span className="bsb-edit-spacer" />
                        <button className="bsb-edit-btn" onClick={() => { setEditing(false); setMarked(new Set()); }}>Отмена</button>
                        <button className="bsb-edit-btn danger" disabled={!marked.size} onClick={deleteMarked}>
                            <i className="bi bi-trash3" /> Удалить{marked.size ? ` (${marked.size})` : ''}
                        </button>
                    </div>
                ) : (
                <div className="bsb-add">
                    <input placeholder="Новый избранный тег" value={newTag}
                           onChange={e => setNewTag(e.target.value)}
                           onKeyDown={e => { if (e.key === 'Enter' && newTag.trim()) { addFavTag(newTag, currentSource); setNewTag(''); } }} />
                    <button disabled={!newTag.trim()} onClick={() => { addFavTag(newTag, currentSource); setNewTag(''); }}>
                        <i className="bi bi-plus-lg" />
                    </button>
                    {q.tags.length > 0 && (
                        <button title="Сохранить теги текущего запроса"
                                onClick={() => q.tags.forEach(t => addFavTag(t.replace(/^-/, ''), currentSource))}>
                            <i className="bi bi-star" />
                        </button>
                    )}
                </div>
                )}
            </Block>

            <Block title="Сохранённые поиски"
                   extra={<button className="bsb-link" onClick={() => setView('saved')}>все <i className="bi bi-arrow-right" /></button>}>
                {saved.length === 0 ? (
                    <div className="bsb-empty">Нажми <i className="bi bi-bookmark-plus" /> в строке поиска, чтобы запомнить поиск</div>
                ) : (
                    <div className="bsb-saved">
                        {saved.slice(0, 5).map(s => (
                            <button key={s.id} className="bsb-saved-item" onClick={() => runSearch(queryOf(s))} title={s.tags || 'все посты'}>
                                <i className="bi bi-bookmark-fill" />
                                <span>{s.title || s.tags || 'все посты'}</span>
                            </button>
                        ))}
                        <button className={`bsb-saved-open ${q.view === 'saved' ? 'active' : ''}`} onClick={() => setView('saved')}>
                            <i className="bi bi-grid-3x2-gap" /> Открыть страницу ({saved.length})
                        </button>
                    </div>
                )}
            </Block>

            <ViewedBlock source={currentSource} />
            <BlacklistBlock source={currentSource} />

            {history.length > 0 && (
                <Block title="Недавние поиски"
                       extra={<button className="bsb-link" onClick={() => clearHistory(currentSource)}>очистить</button>}>
                    <div className="bsb-history">
                        {history.map(h => (
                            <button key={h.tags.join(' ')} className="bsb-hist" onClick={() => runSearch({ tags: h.tags })}>
                                <span className="bsb-hist-tags">
                                    {h.tags.map(t => <span key={t} className={t.startsWith('-') ? 'ex' : ''}>{t.replace(/^-/, '')}</span>)}
                                </span>
                                <span className="bsb-hist-time">{ago(h.at)}</span>
                            </button>
                        ))}
                    </div>
                </Block>
            )}
        </section>
    );
};

export default React.memo(SectionR34);
