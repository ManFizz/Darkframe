import React, {useEffect, useState} from 'react';
import {autoRulesApi} from '@/Infrastructure/Ipc';
import {notify} from '@services/NotificationService';
import RuleBuilder from '../Library/Filters/RuleBuilder';
import TagEditor from '../Library/Metadata/TagEditor';
import CollectionPicker from '../Library/Collection/CollectionPicker';
import {useCollections} from '@hooks/library/useCollections';

const EMPTY = { name: '', enabled: true, apiOnly: false, rules: { op: 'all', items: [] }, addTags: [], collectionId: null, rating: null };

const findName = (nodes, id) => {
    for (const n of nodes) {
        if (n.id === id) return n.name;
        const inner = findName(n.children || [], id);
        if (inner) return inner;
    }
    return null;
};

const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
};

// Editor for one rule (new or existing) with a live "how many files match" preview.
const RuleEditor = ({ initial, onSaved, onCancel }) => {
    const [rule, setRule] = useState(initial);
    const [pv, setPv] = useState(null);
    const [saving, setSaving] = useState(false);
    const set = (patch) => setRule(r => ({ ...r, ...patch }));

    useEffect(() => {
        setPv(null);
        const t = setTimeout(() => autoRulesApi.preview(rule).then(setPv).catch(() => setPv(null)), 450);
        return () => clearTimeout(t);
    }, [rule.rules, rule.addTags, rule.collectionId, rule.rating]);

    const hasAction = rule.addTags.length || rule.collectionId || rule.rating;
    const save = async () => {
        setSaving(true);
        try { onSaved(await autoRulesApi.save(rule)); }
        finally { setSaving(false); }
    };

    return (
        <div className="ar-editor">
            <div className="ar-row">
                <input className="form-control form-control-sm" placeholder="Название правила (необязательно)"
                       value={rule.name} onChange={e => set({ name: e.target.value })} />
                <label className="ar-check">
                    <input type="checkbox" checked={rule.apiOnly} onChange={e => set({ apiOnly: e.target.checked })} />
                    только импорт через API / расширение
                </label>
            </div>

            <div className="ar-section-title">Если</div>
            <RuleBuilder value={rule.rules} onChange={rules => set({ rules })} />

            <div className="ar-section-title">То</div>
            <div className="ar-actions-grid">
                <div className="ar-action">
                    <span className="ar-label"><i aria-hidden="true" className="bi bi-tags" /> Добавить теги</span>
                    <TagEditor tags={rule.addTags} onChange={addTags => set({ addTags })} />
                </div>
                <div className="ar-action">
                    <span className="ar-label"><i aria-hidden="true" className="bi bi-folder" /> Положить в коллекцию</span>
                    <div className="ar-inline">
                        <CollectionPicker currentCollectionId={rule.collectionId} onChange={collectionId => set({ collectionId })} />
                        {rule.collectionId && <button className="ar-clear" onClick={() => set({ collectionId: null })} title="Не перемещать"><i aria-hidden="true" className="bi bi-x-lg" /></button>}
                    </div>
                </div>
                <div className="ar-action">
                    <span className="ar-label"><i aria-hidden="true" className="bi bi-star" /> Рейтинг (если не стоит)</span>
                    <select className="form-select form-select-sm" value={rule.rating || ''} onChange={e => set({ rating: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">не менять</option>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
            </div>

            <div className="ar-footer">
                <span className="ar-preview">
                    {!rule.rules.items.length ? 'Добавь хотя бы одно условие'
                        : pv == null ? <><i aria-hidden="true" className="bi bi-arrow-repeat spin" /> Считаю…</>
                        : <>Сейчас подходит <b>{pv.matched}</b> {plural(pv.matched, 'файл', 'файла', 'файлов')}, изменится <b>{pv.changed}</b></>}
                </span>
                <button className="btn btn-sm btn-outline-secondary" onClick={onCancel}>Отмена</button>
                <button className="btn btn-sm btn-primary" disabled={saving || !rule.rules.items.length || !hasAction} onClick={save}
                        title={!hasAction ? 'Выбери хотя бы одно действие' : ''}>
                    <i aria-hidden="true" className="bi bi-check2 me-1" />Сохранить
                </button>
            </div>
        </div>
    );
};

// Import rules: applied to every new file (dialog, drag & drop, folders, API).
const AutoRulesTool = () => {
    const [rules, setRules] = useState(null);
    const [editing, setEditing] = useState(null);    // rule | EMPTY | null
    const [confirm, setConfirm] = useState(null);    // { id, kind: 'apply'|'delete', pv? }
    const { tree } = useCollections();

    useEffect(() => { autoRulesApi.list().then(setRules); }, []);

    const toggle = async (r) => setRules(await autoRulesApi.save({ ...r, enabled: !r.enabled }));

    const askApply = async (r) => setConfirm({ id: r.id, kind: 'apply', pv: await autoRulesApi.preview(r) });
    const doApply = async (id) => {
        setConfirm(null);
        const res = await autoRulesApi.apply(id);
        notify({ message: res.changed ? `Правило применено к ${res.changed} ${plural(res.changed, 'файлу', 'файлам', 'файлам')}` : 'Изменять нечего', type: res.changed ? 'success' : 'info' });
    };
    const doDelete = async (id) => { setConfirm(null); setRules(await autoRulesApi.remove(id)); };

    const summary = (r) => [
        r.addTags.length ? `теги: ${r.addTags.join(', ')}` : null,
        r.collectionId ? `→ «${findName(tree, r.collectionId) || 'коллекция'}»` : null,
        r.rating ? `★ ${r.rating}` : null,
    ].filter(Boolean).join(' · ');

    return (
        <div className="settings-body cp-manage ar-tool">
            <div className="cp-manage-head">
                <div>
                    <h3>Правила импорта</h3>
                    <p className="cp-manage-desc">Срабатывают на каждый новый файл — из диалога, перетаскивания, Folders и API. Выполняются сверху вниз.</p>
                </div>
                {!editing && <button className="btn btn-sm btn-primary text-nowrap" onClick={() => setEditing(EMPTY)}><i aria-hidden="true" className="bi bi-plus-lg me-1" />Новое правило</button>}
            </div>

            {editing && (
                <RuleEditor initial={editing} onCancel={() => setEditing(null)}
                            onSaved={(list) => { setRules(list); setEditing(null); notify({ message: 'Правило сохранено', type: 'success' }); }} />
            )}

            {rules && !rules.length && !editing && (
                <div className="cp-empty"><i aria-hidden="true" className="bi bi-magic fs-3" /><span>Правил пока нет. Например: «источник pixiv.net → тег pixiv и коллекция Art».</span></div>
            )}

            <div className="ar-list">
                {rules?.map(r => (
                    <div key={r.id} className={`ar-card ${r.enabled ? '' : 'off'}`}>
                        <div className="form-check form-switch ar-switch" title={r.enabled ? 'Выключить' : 'Включить'}>
                            <input className="form-check-input" type="checkbox" checked={r.enabled} onChange={() => toggle(r)} />
                        </div>
                        <div className="ar-card-body">
                            <div className="ar-card-name">
                                {r.name || `Правило #${r.id}`}
                                {r.apiOnly && <span className="ar-badge">API</span>}
                            </div>
                            <div className="ar-card-sum">{r.rules.items.length} {plural(r.rules.items.length, 'условие', 'условия', 'условий')} → {summary(r) || 'нет действий'}</div>
                        </div>
                        {confirm?.id === r.id ? (
                            <div className="ar-confirm">
                                {confirm.kind === 'apply'
                                    ? <>Изменить {confirm.pv.changed} из {confirm.pv.matched}?</>
                                    : <>Удалить правило?</>}
                                <button className="btn btn-sm btn-primary" onClick={() => (confirm.kind === 'apply' ? doApply(r.id) : doDelete(r.id))}>Да</button>
                                <button className="btn btn-sm btn-outline-secondary" onClick={() => setConfirm(null)}>Нет</button>
                            </div>
                        ) : (
                            <div className="ar-card-actions">
                                <button className="btn btn-sm btn-outline-secondary" onClick={() => askApply(r)} title="Применить к уже импортированным файлам">
                                    <i aria-hidden="true" className="bi bi-lightning-charge" /> К существующим
                                </button>
                                <button className="ar-icon" onClick={() => setEditing(r)} title="Изменить"><i aria-hidden="true" className="bi bi-pencil" /></button>
                                <button className="ar-icon danger" onClick={() => setConfirm({ id: r.id, kind: 'delete' })} title="Удалить"><i aria-hidden="true" className="bi bi-trash3" /></button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AutoRulesTool;
