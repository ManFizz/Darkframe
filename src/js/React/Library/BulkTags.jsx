import React, {useMemo, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import {recordTagUse} from '@services/tagPrefs';
import {splitTags} from './Metadata/TagEditor';

// Tags of a whole selection: add, remove, replace — with Undo. The selection stays
// put afterwards (`onChanged` only reloads), so several edits can follow each other.
const BulkTags = ({ selectedItems, onChanged }) => {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState('add');   // add | remove | replace
    const [addText, setAddText] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [busy, setBusy] = useState(false);

    // tag → how many selected items carry it (most common first)
    const counts = useMemo(() => {
        const m = new Map();
        selectedItems.forEach(f => (f.tags || []).forEach(t => m.set(t, (m.get(t) || 0) + 1)));
        return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }, [selectedItems]);

    const apply = async (transform, message) => {
        const before = selectedItems.map(f => ({ id: f.id, tags: [...(f.tags || [])] }));
        const updates = [];
        for (const f of selectedItems) {
            const cur = f.tags || [];
            const next = [...new Set(transform(cur))];
            if (next.length !== cur.length || next.some((t, i) => t !== cur[i])) {
                updates.push({ id: f.id, data: { tags: next } });
            }
        }
        if (!updates.length) { notify({ message: 'Ничего не изменилось', type: 'info' }); return; }
        setBusy(true);
        try {
            await LibraryService.bulkUpdateItems(updates);
            await onChanged?.();
            const changed = new Set(updates.map(u => u.id));
            notify({
                message: `${message} — файлов: ${updates.length}`,
                type: 'success',
                duration: 8000,
                action: {
                    label: 'Отменить',
                    onClick: async () => {
                        await LibraryService.bulkUpdateItems(
                            before.filter(b => changed.has(b.id)).map(b => ({ id: b.id, data: { tags: b.tags } })));
                        await onChanged?.();
                    },
                },
            });
        } finally {
            setBusy(false);
        }
    };

    const doAdd = () => {
        const tags = splitTags(addText.replace(/,/g, ';'));
        if (!tags.length) return;
        tags.forEach(recordTagUse);
        setAddText('');
        apply(cur => [...cur, ...tags], tags.length === 1 ? `Добавлен тег «${tags[0]}»` : `Добавлено тегов: ${tags.length}`);
    };

    const doRemove = (tag) => apply(cur => cur.filter(t => t !== tag), `Убран тег «${tag}»`);

    const doReplace = () => {
        const a = from.trim().toLowerCase();
        const b = splitTags(to)[0];
        if (!a || !b || a === b) return;
        recordTagUse(b);
        apply(cur => (cur.includes(a) ? cur.map(t => (t === a ? b : t)) : cur), `«${a}» → «${b}»`);
        setFrom(''); setTo('');
    };

    return (
        <div className="bulk-action-group bulk-tags">
            <button className={`btn btn-sm btn-outline-secondary ${open ? 'active' : ''}`} onClick={() => setOpen(v => !v)}>
                <i className="bi bi-tags me-1" /> Теги
            </button>
            {open && (
                <>
                    <div className="bulk-move-backdrop" onMouseDown={() => setOpen(false)} />
                    <div className="bulk-tags-panel" onKeyDown={e => e.stopPropagation()}>
                        <div className="bt-tabs">
                            {[['add', 'Добавить', 'bi-plus-lg'], ['remove', 'Убрать', 'bi-dash-lg'], ['replace', 'Заменить', 'bi-arrow-left-right']].map(([id, label, icon]) => (
                                <button key={id} className={mode === id ? 'active' : ''} onClick={() => setMode(id)}>
                                    <i className={`bi ${icon}`} /> {label}
                                </button>
                            ))}
                        </div>

                        {mode === 'add' && (
                            <div className="bt-body">
                                <div className="bt-row">
                                    <input autoFocus className="form-control form-control-sm" placeholder="тег; ещё тег"
                                           value={addText} onChange={e => setAddText(e.target.value)}
                                           onKeyDown={e => { if (e.key === 'Enter') doAdd(); }} />
                                    <button className="btn btn-sm btn-primary" disabled={busy || !addText.trim()} onClick={doAdd}>Добавить</button>
                                </div>
                                <div className="bt-hint">Несколько тегов — через «;» или запятую. Добавятся ко всем {selectedItems.length} файлам.</div>
                            </div>
                        )}

                        {mode === 'remove' && (
                            <div className="bt-body">
                                {counts.length === 0 && <div className="bt-hint">У выбранных файлов нет тегов</div>}
                                <div className="bt-list">
                                    {counts.map(([tag, n]) => (
                                        <div key={tag} className="bt-tag">
                                            <span className="bt-tag-name">{tag}</span>
                                            <span className="bt-tag-count" title="Сколько выбранных файлов с этим тегом">
                                                {n === selectedItems.length ? 'у всех' : `${n} из ${selectedItems.length}`}
                                            </span>
                                            <button disabled={busy} onClick={() => doRemove(tag)} title="Убрать у всех выбранных">
                                                <i className="bi bi-x-lg" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {mode === 'replace' && (
                            <div className="bt-body">
                                <div className="bt-row">
                                    <input className="form-control form-control-sm" list="bt-existing" placeholder="какой тег"
                                           value={from} onChange={e => setFrom(e.target.value)} />
                                    <i className="bi bi-arrow-right" />
                                    <input className="form-control form-control-sm" placeholder="на какой"
                                           value={to} onChange={e => setTo(e.target.value)}
                                           onKeyDown={e => { if (e.key === 'Enter') doReplace(); }} />
                                </div>
                                <datalist id="bt-existing">
                                    {counts.map(([tag]) => <option key={tag} value={tag} />)}
                                </datalist>
                                <button className="btn btn-sm btn-primary w-100" disabled={busy || !from.trim() || !to.trim()} onClick={doReplace}>
                                    Заменить у выбранных
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default BulkTags;
