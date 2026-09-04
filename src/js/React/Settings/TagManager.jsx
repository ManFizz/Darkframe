import React, {useEffect, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';

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

    const reload = async () => {
        const [t, r] = await Promise.all([LibraryService.getAllTags(), LibraryService.getTagRules()]);
        setTags(t); setRules(r); setLoading(false);
    };
    useEffect(() => { reload(); }, []);

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

    const q = search.trim().toLowerCase();
    const filtered = (q ? tags.filter(t => t.name.includes(q)) : tags).slice(0, 500);

    return (
        <div className="settings-overlay" onMouseDown={onClose}>
            <div className="settings-modal tag-manager" onMouseDown={e => e.stopPropagation()}>
                <div className="settings-header">
                    <i className="bi bi-tags-fill me-2" />
                    <span>Управление тегами</span>
                    <button className="settings-close" onClick={onClose} title="Закрыть"><i className="bi bi-x-lg" /></button>
                </div>

                <div className="settings-body">
                    <div className="tm-section">
                        <div className="tm-section-title">Правила переименования</div>
                        <div className="tm-rule-add">
                            <input className="form-control form-control-sm" placeholder="из"
                                   value={ruleFrom} onChange={e => setRuleFrom(e.target.value)} />
                            <i className="bi bi-arrow-right" />
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
                                <span><b>{r.from}</b> <i className="bi bi-arrow-right mx-1" /> {r.to}</span>
                                <button className="tm-icon" title="Удалить правило" onClick={() => delRule(r.id)}><i className="bi bi-x-lg" /></button>
                            </div>
                        ))}
                        {!rules.length && <div className="tm-empty">Правил пока нет — например «dots» → «dot»</div>}
                    </div>

                    <div className="tm-section">
                        <div className="tm-section-title">Теги ({tags.length})</div>
                        <input className="form-control form-control-sm tm-search" placeholder="Поиск тега…"
                               value={search} onChange={e => setSearch(e.target.value)} />
                        <div className="tm-tags">
                            {loading && <div className="tm-empty">Загрузка…</div>}
                            {filtered.map(tag => (
                                <div key={tag.id} className="tm-tag">
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
                                    <button className="tm-icon" title="Переименовать" onClick={() => startRename(tag)}><i className="bi bi-pencil" /></button>
                                    <button className="tm-icon danger" title="Удалить" onClick={() => del(tag)}><i className="bi bi-trash" /></button>
                                </div>
                            ))}
                            {!loading && !filtered.length && <div className="tm-empty">Ничего не найдено</div>}
                        </div>
                        <div className="tm-hint">Переименование в имя существующего тега объединит их.</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TagManager;
