import React, {useEffect, useState} from 'react';

const MB = 1024 * 1024;
const DAY = 86400;

// Number input that keeps the raw text while typing ("1." / "") and reports a
// parsed number (or null when empty) upward.
const fmtNum = (v) => (v == null ? '' : String(Math.round(v * 100) / 100));

const NumInput = ({ value, onChange, placeholder, step = 1, min = 0 }) => {
    const [text, setText] = useState(fmtNum(value));

    // Follow external changes (e.g. "Сбросить"), but not the echo of our own typing —
    // values round-trip through bytes, so compare with a small tolerance.
    useEffect(() => {
        const parsed = text === '' ? null : Number(text);
        const same = (parsed == null && value == null)
            || (parsed != null && value != null && Math.abs(parsed - value) < 0.01);
        if (!same) setText(fmtNum(value));
    }, [value]);   // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <input
            className="form-control form-control-sm adv-num"
            type="number"
            inputMode="decimal"
            min={min}
            step={step}
            placeholder={placeholder}
            value={text}
            onChange={e => {
                const t = e.target.value;
                setText(t);
                const n = t === '' ? null : Number(t);
                if (t === '' || isFinite(n)) onChange(n);
            }}
        />
    );
};

// unix seconds ⇄ <input type="date"> value, in local time
const toDateInput = (sec) => {
    if (sec == null) return '';
    const d = new Date(sec * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fromDateInput = (s, endOfDay = false) => {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    const date = endOfDay ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d, 0, 0, 0);
    return Math.floor(date.getTime() / 1000);
};

const TYPES = [
    { id: 'image', label: 'Изображения', icon: 'bi-image' },
    { id: 'video', label: 'Видео',       icon: 'bi-film' },
    { id: 'gif',   label: 'GIF',         icon: 'bi-filetype-gif' },
];

const ORIENTATIONS = [
    { id: 'any',       label: 'Любая' },
    { id: 'portrait',  label: 'Портрет' },
    { id: 'landscape', label: 'Альбом' },
    { id: 'square',    label: 'Квадрат' },
];

/**
 * Editor for the "advanced" filter conditions (type, size, resolution, orientation,
 * import date, no tags / no collection). Controlled: `value` is the filter object,
 * `onChange(patch)` merges changed fields.
 */
const AdvancedFilterFields = ({ value, onChange }) => {
    const types = value.types || [];
    const dateMode = value.importedWithinDays != null
        ? 'recent'
        : (value.importedFrom != null || value.importedTo != null) ? 'range' : 'any';

    const toggleType = (id) => {
        onChange({ types: types.includes(id) ? types.filter(t => t !== id) : [...types, id] });
    };

    const setDateMode = (mode) => {
        if (mode === 'any')    onChange({ importedWithinDays: null, importedFrom: null, importedTo: null });
        if (mode === 'recent') onChange({ importedWithinDays: value.importedWithinDays ?? 7, importedFrom: null, importedTo: null });
        if (mode === 'range')  onChange({ importedWithinDays: null, importedFrom: value.importedFrom ?? (Math.floor(Date.now() / 1000) - 30 * DAY), importedTo: value.importedTo ?? null });
    };

    return (
        <div className="adv-fields">
            <div className="adv-row">
                <span className="adv-label">Тип</span>
                <div className="adv-chips">
                    {TYPES.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            className={`adv-chip ${types.includes(t.id) ? 'active' : ''}`}
                            onClick={() => toggleType(t.id)}
                        >
                            <i className={`bi ${t.icon}`} /> {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="adv-row">
                <span className="adv-label">Размер, МБ</span>
                <div className="adv-inline">
                    <NumInput
                        value={value.sizeMin != null ? value.sizeMin / MB : null}
                        onChange={n => onChange({ sizeMin: n == null ? null : Math.round(n * MB) })}
                        placeholder="от" step={0.1}
                    />
                    <span className="adv-dash">—</span>
                    <NumInput
                        value={value.sizeMax != null ? value.sizeMax / MB : null}
                        onChange={n => onChange({ sizeMax: n == null ? null : Math.round(n * MB) })}
                        placeholder="до" step={0.1}
                    />
                </div>
            </div>

            <div className="adv-row">
                <span className="adv-label">Мин. сторона, px</span>
                <div className="adv-inline">
                    <NumInput
                        value={value.minSide}
                        onChange={n => onChange({ minSide: n })}
                        placeholder="например, 1080" step={1}
                    />
                </div>
            </div>

            <div className="adv-row">
                <span className="adv-label">Ориентация</span>
                <div className="adv-seg">
                    {ORIENTATIONS.map(o => (
                        <button
                            key={o.id}
                            type="button"
                            className={value.orientation === o.id ? 'active' : ''}
                            onClick={() => onChange({ orientation: o.id })}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="adv-row">
                <span className="adv-label">Добавлено</span>
                <div className="adv-col">
                    <div className="adv-seg">
                        <button type="button" className={dateMode === 'any' ? 'active' : ''} onClick={() => setDateMode('any')}>Когда угодно</button>
                        <button type="button" className={dateMode === 'recent' ? 'active' : ''} onClick={() => setDateMode('recent')}>Последние N дней</button>
                        <button type="button" className={dateMode === 'range' ? 'active' : ''} onClick={() => setDateMode('range')}>Период</button>
                    </div>
                    {dateMode === 'recent' && (
                        <div className="adv-inline">
                            <span className="adv-hint">за последние</span>
                            <NumInput
                                value={value.importedWithinDays}
                                onChange={n => { if (n != null) onChange({ importedWithinDays: Math.max(0, n) }); }}
                                step={1} min={0}
                            />
                            <span className="adv-hint">дн.</span>
                        </div>
                    )}
                    {dateMode === 'range' && (
                        <div className="adv-inline">
                            <input
                                className="form-control form-control-sm adv-date"
                                type="date"
                                value={toDateInput(value.importedFrom)}
                                onChange={e => onChange({ importedFrom: fromDateInput(e.target.value) })}
                            />
                            <span className="adv-dash">—</span>
                            <input
                                className="form-control form-control-sm adv-date"
                                type="date"
                                value={toDateInput(value.importedTo)}
                                onChange={e => onChange({ importedTo: fromDateInput(e.target.value, true) })}
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="adv-row">
                <span className="adv-label">Ещё</span>
                <div className="adv-col">
                    <label className="adv-check">
                        <input type="checkbox" checked={!!value.noTags} onChange={e => onChange({ noTags: e.target.checked })} />
                        Без тегов
                    </label>
                    <label className="adv-check">
                        <input type="checkbox" checked={!!value.noCollection} onChange={e => onChange({ noCollection: e.target.checked })} />
                        Без коллекции
                    </label>
                </div>
            </div>
        </div>
    );
};

// The advanced fields reset to their defaults (search/tags/rating untouched).
export const ADVANCED_RESET = {
    types: [], sizeMin: null, sizeMax: null, minSide: null, orientation: 'any',
    importedWithinDays: null, importedFrom: null, importedTo: null,
    noTags: false, noCollection: false,
};

export default AdvancedFilterFields;
