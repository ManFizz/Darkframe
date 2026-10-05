import React, {useEffect, useRef, useState} from 'react';
import {SORTS, dirLabel, newSeed, sortOf} from '@/shared/librarySort';
import {useViewPref} from '@services/viewPrefs';

/**
 * "Порядок" of the library gallery: what to sort by (grouped list with icons),
 * which way (said in words — "сначала новые"), random with "перемешать", group
 * headers for rating / dates / file types, and an option to remember the order
 * separately for each collection.
 *
 * Click a sort to pick it (its natural direction first); click the current one
 * again to flip the direction.
 */
const DIVIDER_PREF = { rating: 'ratingDividers', type: 'typeDividers' };
const dividerPrefOf = (sort) => DIVIDER_PREF[sort.id] || (sort.month ? 'dateDividers' : null);

const groups = SORTS.reduce((acc, s) => {
    (acc[s.group] ||= []).push(s);
    return acc;
}, {});

const SortMenu = ({ filters, patch }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const cur = sortOf(filters.sortBy);
    const dividerPref = dividerPrefOf(cur);
    const [ratingDividers, setRatingDividers] = useViewPref('ratingDividers');
    const [dateDividers, setDateDividers] = useViewPref('dateDividers');
    const [typeDividers, setTypeDividers] = useViewPref('typeDividers');
    const [perCollection, setPerCollection] = useViewPref('sortPerCollection');
    const dividers = { ratingDividers: [ratingDividers, setRatingDividers], dateDividers: [dateDividers, setDateDividers], typeDividers: [typeDividers, setTypeDividers] }[dividerPref];

    useEffect(() => {
        if (!open) return;
        const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
    }, [open]);

    const pick = (s) => {
        if (s.random) { patch({ sortBy: s.id, seed: newSeed() }); return; }
        if (s.id === cur.id) patch({ order: -filters.order });
        else patch({ sortBy: s.id, order: s.def ?? 1 });
    };
    const shuffle = () => patch({ sortBy: 'random', seed: newSeed() });
    const flip = () => patch({ order: -filters.order });

    return (
        <div className="sort-menu" ref={ref}>
            <button className={`btn btn-outline-secondary sort-menu-btn ${open ? 'active' : ''}`} onClick={() => setOpen(v => !v)}
                    title={cur.random ? 'Случайный порядок' : `${cur.label}: ${dirLabel(cur.id, filters.order)}`}>
                <i className={`bi ${cur.icon}`} />
                <span className="sort-menu-label">{cur.random ? 'Случайно' : cur.label.split(':')[0]}</span>
                <i className="bi bi-chevron-down sort-menu-caret" />
            </button>
            {cur.random ? (
                <button className="btn btn-outline-secondary" onClick={shuffle} title="Перемешать заново">
                    <i className="bi bi-shuffle" />
                </button>
            ) : (
                <button className="btn btn-outline-secondary sort-dir-btn" onClick={flip} title={`Сейчас: ${dirLabel(cur.id, filters.order)} — нажмите, чтобы развернуть`}>
                    <i className={`bi bi-sort-${filters.order === -1 ? 'down' : 'up'}`} />
                </button>
            )}

            {open && (
                <div className="sort-menu-panel">
                    {Object.entries(groups).map(([group, list]) => (
                        <div key={group} className="sort-menu-group">
                            <div className="sort-menu-group-title">{group}</div>
                            {list.map(s => {
                                const active = s.id === cur.id;
                                return (
                                    <div key={s.id} className={`sort-menu-item ${active ? 'active' : ''}`}
                                         onClick={() => pick(s)} title={s.hint || ''}>
                                        <i className={`bi ${s.icon}`} />
                                        <span className="sort-menu-name">{s.label}</span>
                                        {active && !s.random && (
                                            <span className="sort-menu-dir" onClick={e => e.stopPropagation()}>
                                                {[1, -1].map(o => (
                                                    <button key={o} className={filters.order === o ? 'on' : ''}
                                                            onClick={() => patch({ order: o })}>
                                                        {s.dir[o === -1 ? 1 : 0]}
                                                    </button>
                                                ))}
                                            </span>
                                        )}
                                        {s.random && (
                                            <button className="sort-menu-shuffle" title="Перемешать заново"
                                                    onClick={e => { e.stopPropagation(); shuffle(); }}>
                                                <i className="bi bi-arrow-repeat" /> {active ? 'ещё раз' : ''}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                    <div className="sort-menu-options">
                        {dividers && (
                            <label>
                                <input type="checkbox" checked={!!dividers[0]} onChange={e => dividers[1](e.target.checked)} />
                                <span>Разделять на группы {cur.id === 'rating' ? '(по оценке)' : cur.id === 'type' ? '(по типу)' : '(по месяцам)'}</span>
                            </label>
                        )}
                        <label title="Каждая коллекция помнит свой порядок; без этого — один порядок для всех">
                            <input type="checkbox" checked={!!perCollection} onChange={e => setPerCollection(e.target.checked)} />
                            <span>Запоминать для каждой коллекции</span>
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SortMenu;
