import React, {useEffect, useRef, useState} from 'react';
import {SORT_FIELDS, SORT_ORDER, RATING_MIN, RATING_MAX} from '@hooks/library/useLibraryFilter'
import {libraryApi} from '@/Infrastructure/Ipc';
import NotificationBell from "@react/Helpers/NotificationBell";

// ─── Tag filter input with live suggestions ───────────────────────────────────
// Reuses the same libraryApi.searchTags source the metadata TagEditor uses, so
// the navbar filter offers the very tags that actually exist in the library.
const TagFilterInput = ({ filters, addTag, removeTag, toggleTagExclude }) => {
    const [tagInput, setTagInput]       = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [open, setOpen]               = useState(false);
    const wrapperRef                    = useRef(null);
    const lastQueryRef                  = useRef('');

    // Close the suggestion list on any outside click.
    useEffect(() => {
        const handler = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Debounced lookup. A leading − / ! means "exclude", so strip it before searching.
    useEffect(() => {
        const raw = tagInput.trim().replace(/^[-!]/, '');
        if (!raw) { setSuggestions([]); return; }

        const timer = setTimeout(async () => {
            lastQueryRef.current = raw;
            try {
                const results = await libraryApi.searchTags(raw);
                if (lastQueryRef.current !== raw) return;
                const already = new Set(filters.tags.map(t => t.name));
                setSuggestions(results.filter(t => !already.has(t.name)).slice(0, 8));
            } catch (e) {
                console.error('[TagFilterInput] searchTags failed:', e);
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [tagInput, filters.tags]);

    const commit = (value) => {
        const v = value.trim();
        if (!v) return;
        addTag(v);
        setTagInput('');
        setSuggestions([]);
    };

    return (
        <div className="tag-filter" ref={wrapperRef}>
            <div className="tag-filter-tags">
                {filters.tags.map(({ name, exclude }) => (
                    <span
                        key={name}
                        className={`tag-filter-chip ${exclude ? 'exclude' : ''}`}
                        title={exclude ? 'Исключение · клик, чтобы включить' : 'Включение · клик, чтобы исключить'}
                        onClick={() => toggleTagExclude(name)}
                    >
                        {exclude && <i className="bi bi-slash-circle" />}
                        <span className={exclude ? 'struck' : ''}>{name}</span>
                        <i
                            className="bi bi-x"
                            onClick={e => { e.stopPropagation(); removeTag(name); }}
                        />
                    </span>
                ))}
                <input
                    className="tag-filter-input"
                    placeholder={filters.tags.length ? '' : 'Тег…'}
                    title="Enter — добавить. Начни с − чтобы исключить"
                    value={tagInput}
                    onChange={e => { setTagInput(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commit(tagInput); }
                        if (e.key === 'Backspace' && !tagInput && filters.tags.length) {
                            removeTag(filters.tags[filters.tags.length - 1].name);
                        }
                    }}
                />
            </div>

            {open && suggestions.length > 0 && (
                <div className="tag-filter-suggestions">
                    {suggestions.map(t => (
                        <div
                            key={t.name}
                            className="tag-filter-suggestion"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => commit(t.name)}
                        >
                            {t.type != null && <span className={`tag-dot tag-type-${t.type}`} />}
                            <span>{t.name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export const LibraryNavControls = ({ ctx }) => {
    const { filters, update, addTag, removeTag, toggleTagExclude, reset } = ctx;

    const hasFilters =
        filters.search ||
        filters.tags.length > 0 ||
        filters.ratingMin > RATING_MIN ||
        filters.ratingMax < RATING_MAX;

    return (
        <div className="library-nav-controls">
            {/* Search — glass pill with an inline clear */}
            <div className="nav-search">
                <i className="bi bi-search nav-search-icon" />
                <input
                    className="nav-search-input"
                    placeholder="Поиск…"
                    value={filters.search}
                    onChange={e => update('search', e.target.value)}
                />
                {filters.search && (
                    <button className="nav-search-clear" title="Очистить поиск" onClick={() => update('search', '')}>
                        <i className="bi bi-x" />
                    </button>
                )}
            </div>

            <TagFilterInput
                filters={filters}
                addTag={addTag}
                removeTag={removeTag}
                toggleTagExclude={toggleTagExclude}
            />

            {/* Reset-all sits right next to the filters it clears */}
            {hasFilters && (
                <button className="nav-reset" title="Сбросить фильтры" onClick={reset}>
                    <i className="bi bi-x-circle" />
                </button>
            )}

            <span className="nav-counter">
                {ctx.filtered.length} / {ctx.total}
            </span>
        </div>
    );
};

// ─── Rating range filter ──────────────────────────────────────────────────────
const ratingLabel = (min, max) => {
    if (min <= RATING_MIN && max >= RATING_MAX) return 'Рейтинг';
    if (min === 0 && max === 0)                 return 'Без оценки';
    if (max >= RATING_MAX)                       return `★ ${min}+`;
    if (min <= RATING_MIN)                       return `★ ≤ ${max}`;
    return `★ ${min}–${max}`;
};

const RatingFilter = ({ filters, update }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const min = filters.ratingMin ?? RATING_MIN;
    const max = filters.ratingMax ?? RATING_MAX;
    const active = min > RATING_MIN || max < RATING_MAX;

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Keep min ≤ max: dragging one thumb past the other pushes the other along.
    const setMin = (v) => { update('ratingMin', v); if (v > max) update('ratingMax', v); };
    const setMax = (v) => { update('ratingMax', v); if (v < min) update('ratingMin', v); };

    return (
        <div className="rating-filter" ref={ref}>
            <button className={`btn btn-outline-secondary ${active ? 'rating-filter-active' : ''}`}
                    onClick={() => setOpen(v => !v)}>
                {ratingLabel(min, max)}
            </button>

            {open && (
                <div className="rating-filter-panel" onMouseDown={e => e.stopPropagation()}>
                    <div className="rating-filter-presets">
                        <button onClick={() => { update('ratingMin', RATING_MIN); update('ratingMax', RATING_MAX); }}>
                            Любой
                        </button>
                        <button onClick={() => { update('ratingMin', 0); update('ratingMax', 0); }}>
                            Без оценки
                        </button>
                    </div>

                    <div className="rating-filter-readout">
                        {min === 0 && max === 0
                            ? 'Только без оценки'
                            : <>от <b>{min}</b> до <b>{max}</b> ★</>}
                    </div>

                    <label className="rating-filter-slider">
                        <span>От</span>
                        <input type="range" min={RATING_MIN} max={RATING_MAX} value={min}
                               onChange={e => setMin(Number(e.target.value))} />
                        <b>{min}</b>
                    </label>
                    <label className="rating-filter-slider">
                        <span>До</span>
                        <input type="range" min={RATING_MIN} max={RATING_MAX} value={max}
                               onChange={e => setMax(Number(e.target.value))} />
                        <b>{max}</b>
                    </label>
                </div>
            )}
        </div>
    );
};

// Сортировка в navbar для library
export const LibraryNavSort = ({ ctx }) => {
    const { filters, update } = ctx;

    return (
        <div className="d-flex btn-group">
            <RatingFilter filters={filters} update={update} />

            {/* Сортировка */}
            <div className="btn-group dropdown">
                <button className="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                    {
                        {
                            [SORT_FIELDS.ORDER]:       'Порядок',
                            [SORT_FIELDS.IMPORTED_AT]: 'Дата',
                            [SORT_FIELDS.TITLE]:       'Название',
                            [SORT_FIELDS.RATING]:      'Рейтинг',
                            [SORT_FIELDS.SIZE]:        'Размер',
                        }[filters.sortBy]
                    }
                </button>
                <ul className="dropdown-menu dropdown-menu-end">
                    {[
                        [SORT_FIELDS.ORDER,       'Порядок'],
                        [SORT_FIELDS.IMPORTED_AT, 'Дата добавления'],
                        [SORT_FIELDS.TITLE,       'Название'],
                        [SORT_FIELDS.RATING,      'Рейтинг'],
                        [SORT_FIELDS.SIZE,        'Размер'],
                    ].map(([value, label]) => (
                        <li key={value}>
                            <button
                                className={`dropdown-item ${filters.sortBy === value ? 'active' : ''}`}
                                onClick={() => update('sortBy', value)}
                            >
                                {label}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Порядок */}
            <button
                className="btn btn-outline-secondary"
                onClick={() => update('order', filters.order === SORT_ORDER.DESC ? SORT_ORDER.ASC : SORT_ORDER.DESC)}
            >
                <i className={`bi bi-sort-${filters.order === SORT_ORDER.DESC ? 'down' : 'up'}`} />
            </button>

            <NotificationBell />
        </div>
    );
};
