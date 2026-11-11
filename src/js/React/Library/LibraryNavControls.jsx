import React, {useEffect, useRef, useState} from 'react';
import {RATING_MIN, RATING_MAX} from '@hooks/library/useLibraryFilter'
import {libraryApi} from '@/Infrastructure/Ipc';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import NotificationBell from "@react/Helpers/NotificationBell";
import SortMenu from './SortMenu';
import {normalizeFilter, advancedCount, isFilterActive, toSmartFilter} from '@/shared/filterPredicate';
import AdvancedFilterFields, {ADVANCED_RESET} from './Filters/AdvancedFilterFields';
import {useTagPrefs} from '@services/tagPrefs';
import {runVisualSearch} from '@services/visualSearch';

// Reuses the same libraryApi.searchTags source the metadata TagEditor uses, so
// the navbar filter offers the very tags that actually exist in the library.
export const TagFilterInput = ({ filters, addTag, removeTag, toggleTagExclude }) => {
    const [tagInput, setTagInput]       = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [open, setOpen]               = useState(false);
    const wrapperRef                    = useRef(null);
    const lastQueryRef                  = useRef('');
    const prefs                         = useTagPrefs();

    // Nothing typed yet → offer pinned tags first, then the ones you use most.
    const already = new Set(filters.tags.map(t => t.name));
    const idleSuggestions = [
        ...prefs.pinned.filter(n => !already.has(n)).map(name => ({ name, pinned: true })),
        ...prefs.frequent(8, [...already, ...prefs.pinned]).map(name => ({ name })),
    ];
    const typed = tagInput.trim().replace(/^[-!]/, '');
    const shown = typed ? suggestions : idleSuggestions;

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

            {open && shown.length > 0 && (
                <div className="tag-filter-suggestions">
                    {shown.map(t => (
                        <div
                            key={t.name}
                            className="tag-filter-suggestion"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => commit(tagInput.trim().startsWith('-') || tagInput.trim().startsWith('!') ? `-${t.name}` : t.name)}
                        >
                            {t.type != null && <span className={`tag-dot tag-type-${t.type}`} />}
                            <span>{t.name}</span>
                            {t.pinned && <i className="bi bi-pin-angle-fill tag-pin-mark" />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Search by picture: from the clipboard or a file on disk.
const VisualSearchButton = () => {
    const [open, setOpen] = useState(false);
    const go = (q) => { setOpen(false); runVisualSearch(q); };
    return (
        <div className="nav-vsearch">
            <button className={`nav-vsearch-btn ${open ? 'on' : ''}`} onClick={() => setOpen(v => !v)} title="Поиск по картинке">
                <i className="bi bi-image" />
            </button>
            {open && (
                <>
                    <div className="bulk-move-backdrop" onMouseDown={() => setOpen(false)} />
                    <div className="nav-vsearch-menu">
                        <button onClick={() => go({ clipboard: true })}><i className="bi bi-clipboard-image" /> Из буфера обмена</button>
                        <button onClick={() => go({ pick: true })}><i className="bi bi-folder2-open" /> Из файла…</button>
                        <div className="nav-vsearch-hint">Или в просмотрщике: «Искать похожие во всей библиотеке»</div>
                    </div>
                </>
            )}
        </div>
    );
};

export const LibraryNavControls = ({ ctx }) => {
    const { filters, update, addTag, removeTag, toggleTagExclude, reset } = ctx;
    const [savingSmart, setSavingSmart] = useState(false);
    const [smartName, setSmartName]     = useState('');

    const hasFilters = isFilterActive(normalizeFilter(filters));

    const createSmart = async () => {
        const name = smartName.trim();
        setSavingSmart(false); setSmartName('');
        if (!name) return;
        // Every condition (incl. type / size / resolution / dates) goes into the rule.
        await LibraryService.createSmartCollection(name, toSmartFilter(filters));
        notify({ message: `Умная коллекция «${name}» создана`, type: 'success' });
    };

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

            <VisualSearchButton />

            {/* Save the current filter as a smart collection */}
            {hasFilters && (savingSmart ? (
                <input
                    className="nav-smart-input"
                    autoFocus
                    placeholder="Имя умной коллекции…"
                    value={smartName}
                    onChange={e => setSmartName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createSmart(); if (e.key === 'Escape') { setSavingSmart(false); setSmartName(''); } }}
                    onBlur={createSmart}
                />
            ) : (
                <button className="nav-reset" title="Сохранить фильтр как умную коллекцию" onClick={() => setSavingSmart(true)}>
                    <i className="bi bi-funnel-fill" />
                </button>
            ))}

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
                {active ? ratingLabel(min, max) : <><i className="bi bi-star rf-icon" /><span className="rf-text">Рейтинг</span></>}
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

const AdvancedFilter = ({ filters, patch }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const count = advancedCount(normalizeFilter(filters));

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div className="adv-filter" ref={ref}>
            <button
                className={`btn btn-outline-secondary ${count ? 'rating-filter-active' : ''}`}
                title="Дополнительные условия: тип, размер, разрешение, дата…"
                onClick={() => setOpen(v => !v)}
            >
                <i className="bi bi-sliders2" />
                {count > 0 && <span className="adv-filter-badge">{count}</span>}
            </button>

            {open && (
                <div className="adv-filter-panel" onMouseDown={e => e.stopPropagation()}>
                    <div className="adv-filter-head">
                        <span>Условия</span>
                        {count > 0 && (
                            <button className="adv-filter-reset" onClick={() => patch(ADVANCED_RESET)}>
                                Сбросить
                            </button>
                        )}
                    </div>
                    <AdvancedFilterFields value={normalizeFilter(filters)} onChange={patch} />
                </div>
            )}
        </div>
    );
};

// The library's filter / order controls on the right of the top bar.
export const LibraryNavSort = ({ ctx }) => {
    const { filters, update, patch } = ctx;

    return (
        <div className="d-flex btn-group">
            <AdvancedFilter filters={filters} patch={patch} />
            <RatingFilter filters={filters} update={update} />

            {/* Order: what by, which way, random, groups */}
            <SortMenu filters={filters} patch={patch} items={ctx.items} />

            <NotificationBell />
        </div>
    );
};
