import React, {useEffect, useState} from 'react';
import {currentR34Source} from './R34Controller';
import {
    clearHistory, cycleTag, getHistory, runSearch, setQuery, tagState, useBooruQuery, useSearchStatus,
} from './booruQuery';
import useFavoriteTags from '@hooks/useFavoriteTags';
import {useTagKinds} from './tagKinds';
import {SOURCE_TYPES} from '@/Constants';
import {notify} from '@services/NotificationService';

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

const LOGO = { [SOURCE_TYPES.R34]: 'R34', [SOURCE_TYPES.GELBOORU]: 'GB', [SOURCE_TYPES.REALBOORU]: 'RB' };

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

const Block = ({ title, extra, children }) => (
    <div className="bsb-block">
        <div className="bsb-title"><span>{title}</span>{extra}</div>
        {children}
    </div>
);

// Search sidebar for the booru sources: result summary, sort / score / rating
// modifiers, saved tags and recent searches. The tag input itself lives in the top bar.
const SectionR34 = ({ currentSource }) => {
    const q = useBooruQuery();
    const status = useSearchStatus();
    const { favoriteTags, addFavTag, removeFavTag, reorderFavTags } = useFavoriteTags();
    const [newTag, setNewTag] = useState('');
    const [customScore, setCustomScore] = useState('');
    // Saved tags are removed only in an explicit edit mode: mark → "Удалить (N)",
    // with an undo toast. In normal mode a click just drives the search.
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
    const searched = status.query != null && status.source === currentSource;

    // Modifiers re-run an existing search right away; before the first search they just preset it.
    const change = (patch) => (searched ? runSearch(patch) : setQuery(patch));
    const kindOf = useTagKinds(favs.map(f => f.tag));

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

            <Block title="Избранные теги"
                   extra={favs.length > 0 && (editing
                       ? <span className="bsb-hint">выбери теги для удаления</span>
                       : <button className="bsb-link" onClick={() => setEditing(true)} title="Удалить избранные теги">
                             <i className="bi bi-pencil" /> изменить
                         </button>)}>
                <div className={`bsb-chips bsb-favs ${editing ? 'editing' : ''} ${drag ? 'dragging' : ''}`}
                     onDragOver={e => { if (drag) e.preventDefault(); }}
                     onDrop={onDrop}>
                    {favs.map(f => {
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
                                  title={`${f.tag}\n${st === 'include' ? 'В запросе — нажми, чтобы исключить' : st === 'exclude' ? 'Исключён — нажми, чтобы убрать' : 'Нажми, чтобы добавить в запрос'} · перетащи, чтобы переставить`}>
                                <i className="bi bi-grip-vertical bsb-grip" />
                                {st === 'include' && <i className="bi bi-plus-circle-fill bsb-state" />}
                                {st === 'exclude' && <i className="bi bi-dash-circle-fill bsb-state" />}
                                <span className="bsb-tag-name">{f.tag}</span>
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
