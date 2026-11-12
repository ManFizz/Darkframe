import React, {useEffect, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import {setTagPinned, loadPinned} from '@services/tagPrefs';
import {TAG_TYPE_CHOICES, tagTypeLabel} from '@/shared/tagTypes';
import {useTagTypeMenu} from '../Library/Metadata/TagTypeMenu';

const TagManager = ({ onClose }) => {
    const [tags, setTags]       = useState([]);
    const [rules, setRules]     = useState([]);
    const [search, setSearch]   = useState('');
    const [editId, setEditId]   = useState(null);
    const [editVal, setEditVal] = useState('');
    const [ruleFrom, setRuleFrom] = useState('');
    const [ruleTo, setRuleTo]   = useState('');
    const [ruleApply, setRuleApply] = useState(true);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('all');
    const [selected, setSelected] = useState([]);
    const {onTagContextMenu, tagTypeMenu} = useTagTypeMenu();

    const reload = async () => {
        const [t, r] = await Promise.all([LibraryService.getAllTags(), LibraryService.getTagRules()]);
        setTags(t); setRules(r); setLoading(false);
        loadPinned(true);   // renames / deletes may have changed the pinned set
    };
    useEffect(() => { reload(); }, []);
    useEffect(() => {
        window.addEventListener('df:libraryReload', reload);
        return () => window.removeEventListener('df:libraryReload', reload);
    }, []);

    const startRename = (tag) => { setEditId(tag.id); setEditVal(tag.name); };
    const commitRename = async (tag) => {
        const v = editVal.trim().toLowerCase();
        setEditId(null);
        if (!v || v === tag.name) return;
        await LibraryService.renameTag(tag.id, v);
        notify({ message: `«${tag.name}» → «${v}»`, type: 'success' });
        reload();
    };
    const del = async (tag) => {
        if (!confirm(`Удалить тег «${tag.name}» (${tag.count})? Он снимется со всех медиа.`)) return;
        await LibraryService.deleteTag(tag.id);
        reload();
    };
    const addRule = async () => {
        const f = ruleFrom.trim().toLowerCase(), t = ruleTo.trim().toLowerCase();
        if (!f || !t) return;
        try {
            await LibraryService.addTagRule(f, t, ruleApply);
            setRuleFrom(''); setRuleTo('');
            notify({ message: `Правило «${f}» → «${t}» добавлено`, type: 'success' });
            reload();
        } catch (e) {
            notify({ message: `Ошибка: ${e.message}`, type: 'danger' });
        }
    };
    const delRule = async (id) => { await LibraryService.deleteTagRule(id); reload(); };

    // Pinned tags come first in every tag picker and filter.
    const togglePin = async (tag) => {
        await setTagPinned(tag.id, !tag.pinned);
        reload();
    };
    const q = search.trim().toLowerCase();
    const matching = tags.filter(t => (!q || t.name.includes(q)) && (typeFilter === 'all' || String(t.type ?? '') === typeFilter));
    const filtered = matching.slice(0, 500);
    // Types present in the library, for the filter (with how many tags each).
    const typeCounts = tags.reduce((m, t) => m.set(String(t.type ?? ''), (m.get(String(t.type ?? '')) || 0) + 1), new Map());
    const allShownSelected = filtered.length > 0 && filtered.every(t => selected.includes(t.id));
    const toggleAllShown = () => setSelected(allShownSelected ? [] : filtered.map(t => t.id).slice(0, 500));
    // A new search / filter starts a new selection: hidden tags never get changed by surprise.
    useEffect(() => { setSelected([]); }, [q, typeFilter]);
    const bulkType = async value => {
        if (value === 'choose') return;
        const type = value === '' ? null : Number(value);
        try {
            await LibraryService.setTagType(selected, type);
            notify({ message: `Тегов: ${selected.length} — ${type == null ? 'тип как на сайте' : tagTypeLabel(type).toLowerCase()}`, type: 'success' });
            setSelected([]);
            await reload();
        } catch (e) { notify({ message: e.message, type: 'danger' }); }
    };

    return (
        <div className="settings-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            {tagTypeMenu}
            <div className="settings-modal tag-manager" onMouseDown={e => e.stopPropagation()}>
                <div className="settings-header">
                    <i aria-hidden="true" className="bi bi-tags-fill me-2" />
                    <span>Управление тегами</span>
                    <button className="settings-close" onClick={onClose} title="Закрыть"><i aria-hidden="true" className="bi bi-x-lg" /></button>
                </div>

                <div className="settings-body">
                    <div className="tm-section">
                        <div className="tm-section-title">Правила переименования</div>
                        <div className="tm-rule-add">
                            <input className="form-control form-control-sm" placeholder="из"
                                   value={ruleFrom} onChange={e => setRuleFrom(e.target.value)} />
                            <i aria-hidden="true" className="bi bi-arrow-right" />
                            <input className="form-control form-control-sm" placeholder="в"
                                   value={ruleTo} onChange={e => setRuleTo(e.target.value)}
                                   onKeyDown={e => e.key === 'Enter' && addRule()} />
                            <label className="tm-check" title="Сразу переименовать существующий тег">
                                <input type="checkbox" checked={ruleApply} onChange={e => setRuleApply(e.target.checked)} />
                                к существующим
                            </label>
                            <button className="btn btn-sm btn-primary" onClick={addRule}>Добавить</button>
                        </div>
                        {rules.map(r => (
                            <div key={r.id} className="tm-rule">
                                <span><b>{r.from}</b> <i aria-hidden="true" className="bi bi-arrow-right mx-1" /> {r.to}</span>
                                <button className="tm-icon" title="Удалить правило" onClick={() => delRule(r.id)}><i aria-hidden="true" className="bi bi-x-lg" /></button>
                            </div>
                        ))}
                        {!rules.length && <div className="tm-empty">Правил пока нет — например «dots» → «dot»</div>}
                    </div>

                    <div className="tm-section">
                        <div className="tm-section-title">Теги ({tags.length})</div>
                        <div className="tm-toolbar">
                            <input className="form-control form-control-sm tm-search" placeholder="Поиск тега…"
                                   value={search} onChange={e => setSearch(e.target.value)} />
                            <select className="form-select form-select-sm tm-type-filter" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Фильтр по типу">
                                <option value="all">Все типы</option>
                                {[...typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => (
                                    <option key={v} value={v}>{tagTypeLabel(v === '' ? null : Number(v))} · {n}</option>
                                ))}
                            </select>
                        </div>
                        <div className={`tm-bulk ${selected.length ? 'on' : ''}`}>
                            <label className="tm-check" title="Выделить все показанные">
                                <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} disabled={!filtered.length} />
                                {selected.length ? `Выделено: ${selected.length}` : `Выделить все (${filtered.length})`}
                            </label>
                            {!!selected.length && <>
                                <select className="form-select form-select-sm" value="choose" onChange={e => bulkType(e.target.value)} aria-label="Тип выделенных тегов">
                                    <option value="choose" disabled>Назначить тип…</option>
                                    {TAG_TYPE_CHOICES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
                                    <option value="">Как на сайте</option>
                                </select>
                                <button className="cp-linkbtn" onClick={() => setSelected([])}>Снять</button>
                            </>}
                        </div>
                        <div className="tm-tags">
                            {loading && <div className="tm-empty">Загрузка…</div>}
                            {filtered.map(tag => (
                                <div key={tag.id} className={`tm-tag ${tag.pinned ? 'pinned' : ''} ${selected.includes(tag.id) ? 'sel' : ''}`} onContextMenu={e => onTagContextMenu(e, tag.name)}>
                                    <input type="checkbox" className="tm-tag-check" aria-label={`Выделить ${tag.name}`} checked={selected.includes(tag.id)} onChange={e => setSelected(prev => e.target.checked ? [...prev, tag.id].slice(0, 500) : prev.filter(id => id !== tag.id))} />
                                    <button
                                        className={`tm-icon tm-pin ${tag.pinned ? 'on' : ''}`}
                                        title={tag.pinned ? 'Открепить' : 'Закрепить — будет первым в подсказках'}
                                        onClick={() => togglePin(tag)}
                                    >
                                        <i aria-hidden="true" className={`bi ${tag.pinned ? 'bi-pin-angle-fill' : 'bi-pin-angle'}`} />
                                    </button>
                                    {editId === tag.id ? (
                                        <input autoFocus className="form-control form-control-sm tm-tag-edit"
                                               value={editVal}
                                               onChange={e => setEditVal(e.target.value)}
                                               onKeyDown={e => { if (e.key === 'Enter') commitRename(tag); if (e.key === 'Escape') setEditId(null); }}
                                               onBlur={() => commitRename(tag)} />
                                    ) : (
                                        <span className="tm-tag-name" onDoubleClick={() => startRename(tag)}>{tag.name}</span>
                                    )}
                                    <span className="tm-tag-count">{tag.count}</span>
                                    <button className={`tm-type-chip ${tag.userType != null ? 'manual' : ''}`} onClick={e => onTagContextMenu(e, tag.name)}
                                            title={`Тип: ${tagTypeLabel(tag.type)}${tag.userType != null ? ' (задан вручную)' : ''} — нажмите, чтобы изменить`}>
                                        <span className={`tag-dot tag-type-${tag.type ?? 'none'}`} />
                                        {tagTypeLabel(tag.type)}
                                    </button>
                                    <button className="tm-icon" title="Переименовать" onClick={() => startRename(tag)}><i aria-hidden="true" className="bi bi-pencil" /></button>
                                    <button className="tm-icon danger" title="Удалить" onClick={() => del(tag)}><i aria-hidden="true" className="bi bi-trash" /></button>
                                </div>
                            ))}
                            {!loading && !filtered.length && <div className="tm-empty">Ничего не найдено</div>}
                            {matching.length > filtered.length && <div className="tm-empty">Показаны первые {filtered.length} из {matching.length} — уточните поиск</div>}
                        </div>
                        <div className="tm-hint">
                            Переименование в имя существующего тега объединит их.
                            Закреплённые теги показываются первыми в подсказках и фильтрах.
                            Тип тега меняется кликом по нему или правой кнопкой по тегу где угодно; теги с типом «Модель» собираются во вкладке «Модели».
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TagManager;
