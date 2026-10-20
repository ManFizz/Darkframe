import React, {useEffect, useRef, useState} from 'react';
import {currentR34Source} from './R34Controller';
import {loadPreview, previewCache as cache} from './previewQueue';
import {buildQueryString, runSearch, setQuery, setView} from './booruQuery';
import {
    queryOf, removeSearch, reorderSearches, restoreSearch, tagsOf, updateSearch, useSavedSearches,
} from './savedSearches';
import {useTagKinds} from './tagKinds';
import {notify} from '@services/NotificationService';
import {cachedMediaUrl} from '@/Infrastructure/MediaCache';
import {FILE_TYPES} from '@/Constants';

const SORT_LABEL = { score: 'лучшие', random: 'случайные' };

const fmt = (n) => (n == null ? '—' : n.toLocaleString('ru-RU'));

// ─── One saved search ─────────────────────────────────────────────────────────
const SearchCard = ({ row, dragging, onDragStart, onDragOver, onDragEnd, refreshToken }) => {
    const query = buildQueryString({ ...queryOf(row) });
    const key = `${row.source}|${query}`;
    const [preview, setPreview] = useState(cache.get(key) || null);
    const [loading, setLoading] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [title, setTitle] = useState(row.title || '');
    const [confirmDel, setConfirmDel] = useState(false);
    const ref = useRef(null);
    const tags = tagsOf(row);
    const kindOf = useTagKinds(tags.map(t => t.replace(/^-/, '')));

    const load = (force) => {
        setLoading(true);
        loadPreview(key, query, force).then(res => { setPreview(res); setLoading(false); });
    };

    // Fetch only once the card scrolls into view.
    useEffect(() => {
        if (preview) return;
        const el = ref.current;
        const io = new IntersectionObserver(([hit]) => {
            if (hit.isIntersecting) { io.disconnect(); load(false); }
        }, { rootMargin: '300px' });
        io.observe(el);
        return () => io.disconnect();
    }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps

    // "Обновить все" on the page.
    useEffect(() => { if (refreshToken) load(true); }, [refreshToken]);   // eslint-disable-line react-hooks/exhaustive-deps

    const total = preview?.total ?? null;
    const fresh = total != null && row.lastTotal != null ? Math.max(0, total - row.lastTotal) : 0;

    const open = (openRemoteId) => {
        updateSearch(row.id, { lastTotal: total ?? row.lastTotal, lastOpenedAt: Math.floor(Date.now() / 1000) });
        setQuery(queryOf(row));
        runSearch(null, { openRemoteId });
    };

    const commitTitle = () => {
        setRenaming(false);
        if ((title || '') !== (row.title || '')) updateSearch(row.id, { title: title.trim() || null });
    };

    const remove = async () => {
        setConfirmDel(false);
        const snapshot = { ...row };
        await removeSearch(row.id);
        notify({
            message: `Поиск «${row.title || row.tags || 'без тегов'}» удалён`,
            type: 'info',
            duration: 8000,
            action: { label: 'Вернуть', onClick: () => restoreSearch(snapshot) },
        });
    };

    return (
        <div ref={ref} className={`svs-card ${dragging ? 'drag-src' : ''}`}
             draggable={!renaming}
             onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
            <div className="svs-head">
                <i className="bi bi-grip-vertical svs-grip" title="Перетащи, чтобы переставить" />
                <div className="svs-query" onClick={() => !renaming && open()}>
                    {renaming ? (
                        <input className="svs-title-input" autoFocus value={title} placeholder="Название поиска"
                               onClick={e => e.stopPropagation()}
                               onChange={e => setTitle(e.target.value)}
                               onBlur={commitTitle}
                               onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitle(row.title || ''); setRenaming(false); } }} />
                    ) : row.title && <div className="svs-title">{row.title}</div>}
                    <div className="svs-tags">
                        {tags.length ? tags.map(t => (
                            <span key={t} className={`svs-tag kind-${kindOf(t.replace(/^-/, ''))} ${t.startsWith('-') ? 'ex' : ''}`}>{t.replace(/^-/, '')}</span>
                        )) : <span className="svs-tag muted">все посты</span>}
                        {row.minScore > 0 && <span className="svs-mod"><i className="bi bi-star-fill" /> {row.minScore}+</span>}
                        {SORT_LABEL[row.sort] && <span className="svs-mod"><i className="bi bi-sort-down" /> {SORT_LABEL[row.sort]}</span>}
                        {row.rating !== 'any' && <span className="svs-mod">{row.rating}</span>}
                    </div>
                </div>

                <div className="svs-stats">
                    <span className="svs-total" title="Постов по этому поиску">{loading && total == null ? '…' : fmt(total)}</span>
                    {fresh > 0 && <span className="svs-new" title="С прошлого открытия">+{fmt(fresh)} новых</span>}
                </div>

                <div className="svs-actions">
                    <button className="svs-btn primary" onClick={() => open()} title="Открыть поиск"><i className="bi bi-search" /> Открыть</button>
                    <button className="svs-btn" onClick={() => load(true)} title="Обновить превью"><i className={`bi bi-arrow-clockwise ${loading ? 'spin' : ''}`} /></button>
                    <button className="svs-btn" onClick={() => setRenaming(true)} title="Переименовать"><i className="bi bi-pencil" /></button>
                    {confirmDel ? (
                        <span className="svs-confirm">
                            Удалить?
                            <button className="svs-btn danger" onClick={remove}>Да</button>
                            <button className="svs-btn" onClick={() => setConfirmDel(false)}>Нет</button>
                        </span>
                    ) : (
                        <button className="svs-btn" onClick={() => setConfirmDel(true)} title="Удалить поиск"><i className="bi bi-trash3" /></button>
                    )}
                </div>
            </div>

            <div className="svs-strip">
                {!preview ? Array.from({ length: 8 }, (_, i) => <div key={i} className="svs-thumb skel" />)
                    : preview.error ? <div className="svs-strip-msg err"><i className="bi bi-exclamation-triangle" /> {preview.error}</div>
                    : !preview.items.length ? <div className="svs-strip-msg">Ничего не найдено</div>
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

// ─── Page ─────────────────────────────────────────────────────────────────────
const SavedSearchesPage = ({ source }) => {
    const saved = useSavedSearches(source);
    const [drag, setDrag] = useState(null);   // { id, order: [ids] }
    const [refreshToken, setRefreshToken] = useState(0);

    const shown = drag ? drag.order.map(id => saved.find(s => s.id === id)).filter(Boolean) : saved;

    const refreshAll = () => {
        for (const k of [...cache.keys()]) if (k.startsWith(`${source}|`)) cache.delete(k);
        setRefreshToken(v => v + 1);
    };

    const dragOver = (e, overId) => {
        if (!drag) return;
        e.preventDefault();
        if (overId === drag.id || !drag.order.includes(overId)) return;
        setDrag(d => {
            const order = d.order.filter(id => id !== d.id);
            order.splice(order.indexOf(overId) + (d.order.indexOf(overId) > d.order.indexOf(d.id) ? 1 : 0), 0, d.id);
            return { ...d, order };
        });
    };
    const drop = (e) => {
        if (!drag) return;
        e.preventDefault();
        if (drag.order.join() !== saved.map(s => s.id).join()) reorderSearches(source, drag.order);
        setDrag(null);
    };

    return (
        <div className="svs-page">
            <div className="svs-page-head">
                <button className="svs-btn" onClick={() => setView('search')} title="Назад к результатам"><i className="bi bi-arrow-left" /></button>
                <div>
                    <div className="svs-page-title"><i className="bi bi-bookmarks-fill" /> Сохранённые поиски</div>
                    <div className="svs-page-sub">{currentR34Source?.name} · {saved.length}</div>
                </div>
                <span className="svs-spacer" />
                {saved.length > 0 && <button className="svs-btn" onClick={refreshAll}><i className="bi bi-arrow-clockwise" /> Обновить все</button>}
            </div>

            {saved.length === 0 ? (
                <div className="booru-empty">
                    <i className="bi bi-bookmark-plus" />
                    <div className="be-title">Пока ничего не сохранено</div>
                    <div className="be-sub">Набери поиск и нажми <i className="bi bi-bookmark" /> в строке поиска — он появится здесь вместе с превью свежих постов.</div>
                </div>
            ) : (
                <div className="svs-list" onDragOver={e => { if (drag) e.preventDefault(); }} onDrop={drop}>
                    {shown.map(row => (
                        <SearchCard
                            key={`${row.id}-${row.title || ''}`}
                            row={row}
                            refreshToken={refreshToken}
                            dragging={drag?.id === row.id}
                            onDragStart={e => {
                                if (e.target.closest('input, button')) { e.preventDefault(); return; }
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', String(row.id));
                                setDrag({ id: row.id, order: saved.map(s => s.id) });
                            }}
                            onDragOver={e => dragOver(e, row.id)}
                            onDragEnd={() => setDrag(null)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default SavedSearchesPage;
