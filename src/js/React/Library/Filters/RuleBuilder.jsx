import React from 'react';
import {useCollections} from '@hooks/library/useCollections';

// Field catalogue: label, comparison options and the value editor kind.
const FIELDS = {
    tag:         { label: 'Тег',              cmps: [['has', 'есть'], ['not', 'нет']], input: 'text', ph: 'имя тега' },
    title:       { label: 'Название',         cmps: [['has', 'содержит'], ['not', 'не содержит']], input: 'text', ph: 'текст' },
    source:      { label: 'Источник (домен)', cmps: [['is', 'это'], ['not', 'не'], ['present', 'указан'], ['empty', 'не указан']], input: 'text', ph: 'pixiv.net' },
    rating:      { label: 'Рейтинг',          cmps: [['gte', '≥'], ['lte', '≤'], ['eq', '=']], input: 'number', min: 0, max: 10 },
    type:        { label: 'Тип',              cmps: [['is', 'это'], ['not', 'не']], input: 'select', options: [['image', 'Изображение'], ['video', 'Видео'], ['gif', 'GIF'], ['manga', 'Манга']] },
    size:        { label: 'Размер, МБ',       cmps: [['gte', '≥'], ['lte', '≤']], input: 'number', step: 0.5 },
    duration:    { label: 'Длительность, с',  cmps: [['gte', '≥'], ['lte', '≤']], input: 'number' },
    width:       { label: 'Ширина, px',       cmps: [['gte', '≥'], ['lte', '≤']], input: 'number' },
    height:      { label: 'Высота, px',       cmps: [['gte', '≥'], ['lte', '≤']], input: 'number' },
    minSide:     { label: 'Меньшая сторона',  cmps: [['gte', '≥'], ['lte', '≤']], input: 'number' },
    orientation: { label: 'Ориентация',       cmps: [['is', 'это']], input: 'select', options: [['landscape', 'Альбомная'], ['portrait', 'Портретная'], ['square', 'Квадрат']] },
    imported:    { label: 'Добавлен',         cmps: [['within', 'за последние'], ['older', 'раньше чем']], input: 'number', suffix: 'дн.' },
    collection:  { label: 'Коллекция',        cmps: [['is', 'это'], ['not', 'не'], ['none', 'без коллекции']], input: 'collection' },
    viewed:      { label: 'Просмотр',         cmps: [['never', 'ни разу не открывал'], ['not_within', 'не открывал'], ['within', 'открывал за']], input: 'number', suffix: 'дн.' },
};

const NO_VALUE = new Set(['present', 'empty', 'none', 'never']);

const flatCollections = (nodes, depth = 0) => nodes.flatMap(n => n.isSmart ? [] : [
    { id: n.id, name: `${'  '.repeat(depth)}${n.name}` }, ...flatCollections(n.children || [], depth + 1),
]);

const Condition = ({ c, onChange, onRemove, collections }) => {
    const def = FIELDS[c.field] || FIELDS.tag;
    const set = (patch) => onChange({ ...c, ...patch });
    return (
        <div className="rb-cond">
            <select className="form-select form-select-sm rb-field" value={c.field}
                    onChange={e => { const f = e.target.value; set({ field: f, cmp: FIELDS[f].cmps[0][0], value: '' }); }}>
                {Object.entries(FIELDS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
            <select className="form-select form-select-sm rb-cmp" value={c.cmp} onChange={e => set({ cmp: e.target.value })}>
                {def.cmps.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {NO_VALUE.has(c.cmp) ? <span /> : (
                def.input === 'select' ? (
                    <select className="form-select form-select-sm rb-value" value={c.value} onChange={e => set({ value: e.target.value })}>
                        <option value="">—</option>
                        {def.options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                ) : def.input === 'collection' ? (
                    <select className="form-select form-select-sm rb-value" value={c.value} onChange={e => set({ value: e.target.value })}>
                        <option value="">—</option>
                        {collections.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
                    </select>
                ) : (
                    <span className="rb-value-wrap">
                        <input className="form-control form-control-sm rb-value" type={def.input} value={c.value}
                               min={def.min} max={def.max} step={def.step} placeholder={def.ph}
                               onChange={e => set({ value: e.target.value })} />
                        {def.suffix && <span className="rb-suffix">{def.suffix}</span>}
                    </span>
                )
            )}
            <button className="rb-remove" onClick={onRemove} title="Убрать условие"><i aria-hidden="true" className="bi bi-x-lg" /></button>
        </div>
    );
};

const Group = ({ group, onChange, onRemove, depth, collections }) => {
    const setItem = (i, v) => onChange({ ...group, items: group.items.map((x, j) => (j === i ? v : x)) });
    const removeItem = (i) => onChange({ ...group, items: group.items.filter((_, j) => j !== i) });
    const add = (item) => onChange({ ...group, items: [...group.items, item] });

    return (
        <div className={`rb-group depth-${depth}`}>
            <div className="rb-group-head">
                <span>Подходит, если выполнены</span>
                <div className="rb-op">
                    <button className={group.op === 'all' ? 'active' : ''} onClick={() => onChange({ ...group, op: 'all' })}>все</button>
                    <button className={group.op === 'any' ? 'active' : ''} onClick={() => onChange({ ...group, op: 'any' })}>любое</button>
                </div>
                <span>условия</span>
                {onRemove && <button className="rb-remove group" onClick={onRemove} title="Убрать группу"><i aria-hidden="true" className="bi bi-trash3" /></button>}
            </div>
            <div className="rb-items">
                {group.items.map((x, i) => (x.items
                    ? <Group key={i} group={x} depth={depth + 1} collections={collections}
                             onChange={v => setItem(i, v)} onRemove={() => removeItem(i)} />
                    : <Condition key={i} c={x} collections={collections}
                                 onChange={v => setItem(i, v)} onRemove={() => removeItem(i)} />))}
                {!group.items.length && <div className="rb-empty">Пока нет условий</div>}
            </div>
            <div className="rb-add">
                <button onClick={() => add({ field: 'tag', cmp: 'has', value: '' })}><i aria-hidden="true" className="bi bi-plus-lg" /> Условие</button>
                {depth < 3 && (
                    <button onClick={() => add({ op: group.op === 'all' ? 'any' : 'all', items: [{ field: 'tag', cmp: 'has', value: '' }] })}>
                        <i aria-hidden="true" className="bi bi-diagram-2" /> Группа
                    </button>
                )}
            </div>
        </div>
    );
};

// Nested "all / any" condition groups for smart collections.
const RuleBuilder = ({ value, onChange }) => {
    const { tree } = useCollections();
    const collections = flatCollections(tree);
    const root = value || { op: 'all', items: [] };
    return <Group group={root} depth={0} collections={collections} onChange={onChange} />;
};

export default RuleBuilder;
