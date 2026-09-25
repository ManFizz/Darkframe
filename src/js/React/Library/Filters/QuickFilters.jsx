import React, {useCallback, useState} from 'react';
import {useLibraryContext} from '@/LibraryContext';
import {FILTER_DEFAULTS} from '@/shared/filterPredicate';
import {useTagPrefs} from '@services/tagPrefs';

const CUSTOM_KEY    = 'jsg_quick_filters';
const COLLAPSED_KEY = 'jsg_quick_filters_collapsed';

// A preset is a partial filter ("patch"). Chips apply on top of the current view and
// combine with AND; media types are the exception and union ("Видео" + "GIF").
const BUILT_IN = [
    { id: 'video',   label: 'Видео',          icon: 'bi-film',          patch: { types: ['video'] } },
    { id: 'gif',     label: 'GIF',            icon: 'bi-filetype-gif',  patch: { types: ['gif'] } },
    { id: 'image',   label: 'Изображения',    icon: 'bi-image',         patch: { types: ['image'] } },
    { id: 'nocol',   label: 'Без коллекции',  icon: 'bi-inbox',         patch: { noCollection: true } },
    { id: 'notags',  label: 'Без тегов',      icon: 'bi-tag',           patch: { noTags: true } },
    { id: 'unrated', label: 'Без оценки',     icon: 'bi-star',          patch: { ratingMin: 0, ratingMax: 0 } },
    { id: 'top',     label: '5★+',            icon: 'bi-star-fill',     patch: { ratingMin: 5, ratingMax: 10 } },
    { id: 'week',    label: 'За неделю',      icon: 'bi-calendar-week', patch: { importedWithinDays: 7, importedFrom: null, importedTo: null } },
];

const loadCustom = () => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); }
    catch { return []; }
};
const saveCustom = (list) => {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* ignore */ }
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function isActive(patch, filters) {
    return Object.entries(patch).every(([k, v]) => {
        if (k === 'types') return v.every(t => (filters.types || []).includes(t));
        if (k === 'tags')  return v.every(t => (filters.tags || []).some(x => x.name === t.name && x.exclude === t.exclude));
        return same(filters[k], v);
    });
}

function turnOn(patch, filters) {
    const out = {};
    for (const [k, v] of Object.entries(patch)) {
        if (k === 'types') out.types = [...new Set([...(filters.types || []), ...v])];
        else if (k === 'tags') {
            const have = filters.tags || [];
            out.tags = [...have, ...v.filter(t => !have.some(x => x.name === t.name))];
        }
        else out[k] = v;
    }
    return out;
}

function turnOff(patch, filters) {
    const out = {};
    for (const k of Object.keys(patch)) {
        if (k === 'types') out.types = (filters.types || []).filter(t => !patch.types.includes(t));
        else if (k === 'tags') out.tags = (filters.tags || []).filter(t => !patch.tags.some(x => x.name === t.name));
        else out[k] = FILTER_DEFAULTS[k];
    }
    return out;
}

// Everything in the current filter that differs from the defaults (sorting excluded).
function currentPatch(filters) {
    const p = {};
    for (const k of Object.keys(FILTER_DEFAULTS)) {
        if (!same(filters[k], FILTER_DEFAULTS[k])) p[k] = filters[k];
    }
    return p;
}

const QuickFilters = () => {
    const ctx = useLibraryContext();
    const prefs = useTagPrefs();
    const [custom, setCustom] = useState(loadCustom);
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1');
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState('');

    const toggleCollapsed = useCallback(() => {
        setCollapsed(v => {
            const next = !v;
            try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
            return next;
        });
    }, []);

    if (!ctx) return null;
    const { filters, patch } = ctx;

    const toggle = (preset) => {
        patch(isActive(preset.patch, filters) ? turnOff(preset.patch, filters) : turnOn(preset.patch, filters));
    };

    const current = currentPatch(filters);
    const canSave = Object.keys(current).length > 0;

    const saveCurrent = () => {
        const label = name.trim();
        setNaming(false); setName('');
        if (!label || !canSave) return;
        const next = [...custom, { id: `c${Date.now()}`, label, patch: current }];
        setCustom(next);
        saveCustom(next);
    };

    const removeCustom = (id) => {
        const next = custom.filter(c => c.id !== id);
        setCustom(next);
        saveCustom(next);
    };

    return (
        <div className={`quick-filters ${collapsed ? 'collapsed' : ''}`}>
            <button className="quick-filters-toggle" onClick={toggleCollapsed} title={collapsed ? 'Показать быстрые фильтры' : 'Скрыть'}>
                <i className={`bi bi-chevron-${collapsed ? 'right' : 'down'}`} />
                <i className="bi bi-lightning-charge-fill" />
                {collapsed && <span>Быстрые фильтры</span>}
            </button>

            {!collapsed && (
                <div className="quick-filters-chips">
                    {BUILT_IN.map(p => (
                        <button
                            key={p.id}
                            className={`qf-chip ${isActive(p.patch, filters) ? 'active' : ''}`}
                            onClick={() => toggle(p)}
                        >
                            <i className={`bi ${p.icon}`} />{p.label}
                        </button>
                    ))}

                    {/* Pinned tags (Tag Manager) as one-click tag filters */}
                    {prefs.pinned.length > 0 && <span className="qf-sep" />}
                    {prefs.pinned.map(name => {
                        const preset = { patch: { tags: [{ name, exclude: false }] } };
                        return (
                            <button
                                key={`tag:${name}`}
                                className={`qf-chip qf-chip--tag ${isActive(preset.patch, filters) ? 'active' : ''}`}
                                title="Закреплённый тег"
                                onClick={() => toggle(preset)}
                            >
                                <i className="bi bi-hash" />{name}
                            </button>
                        );
                    })}

                    {custom.length > 0 && <span className="qf-sep" />}
                    {custom.map(p => (
                        <span key={p.id} className={`qf-chip qf-chip--custom ${isActive(p.patch, filters) ? 'active' : ''}`}>
                            <button className="qf-chip-main" onClick={() => toggle(p)}>
                                <i className="bi bi-bookmark-fill" />{p.label}
                            </button>
                            <button className="qf-chip-del" title="Удалить пресет" onClick={() => removeCustom(p.id)}>
                                <i className="bi bi-x" />
                            </button>
                        </span>
                    ))}

                    {naming ? (
                        <input
                            className="qf-name-input"
                            autoFocus
                            placeholder="Название пресета…"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') saveCurrent();
                                if (e.key === 'Escape') { setNaming(false); setName(''); }
                            }}
                            onBlur={saveCurrent}
                        />
                    ) : (
                        <button
                            className="qf-chip qf-chip--add"
                            disabled={!canSave}
                            title={canSave ? 'Сохранить текущий фильтр как пресет' : 'Сначала настройте фильтр'}
                            onClick={() => setNaming(true)}
                        >
                            <i className="bi bi-plus-lg" />Пресет
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default QuickFilters;
