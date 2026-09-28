import React, {useCallback, useEffect, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import {normalizeFilter, toSmartFilter} from '@/shared/filterPredicate';
import AdvancedFilterFields from './AdvancedFilterFields';
import RuleBuilder from './RuleBuilder';
import {TagFilterInput} from '../LibraryNavControls';

const parseFilter = (json) => {
    try { return normalizeFilter(JSON.parse(json || '{}')); }
    catch { return normalizeFilter({}); }
};

const RATINGS = Array.from({ length: 11 }, (_, i) => i);

// Edit an existing smart collection: name + every condition, with a live count of
// how many items currently match.
const SmartFilterEditor = ({ collection, onClose }) => {
    const [name, setName]     = useState(collection.name || '');
    const [filter, setFilter] = useState(() => parseFilter(collection.filter));
    const [matches, setMatches] = useState(null);
    const [saving, setSaving] = useState(false);

    const patch = useCallback((values) => setFilter(prev => normalizeFilter({ ...prev, ...values })), []);

    const addTag = useCallback((raw) => {
        const v = raw.trim().toLowerCase();
        const exclude = v.startsWith('-') || v.startsWith('!');
        const tagName = exclude ? v.slice(1) : v;
        if (!tagName) return;
        setFilter(prev => prev.tags.some(t => t.name === tagName)
            ? prev
            : { ...prev, tags: [...prev.tags, { name: tagName, exclude }] });
    }, []);
    const removeTag = useCallback((tagName) => {
        setFilter(prev => ({ ...prev, tags: prev.tags.filter(t => t.name !== tagName) }));
    }, []);
    const toggleTagExclude = useCallback((tagName) => {
        setFilter(prev => ({ ...prev, tags: prev.tags.map(t => t.name === tagName ? { ...t, exclude: !t.exclude } : t) }));
    }, []);

    // Debounced "how many items match right now".
    useEffect(() => {
        setMatches(null);
        const t = setTimeout(() => {
            LibraryService.getSmartItems(toSmartFilter(filter))
                .then(res => setMatches(res.items?.length ?? 0))
                .catch(() => setMatches(null));
        }, 400);
        return () => clearTimeout(t);
    }, [filter]);

    const save = useCallback(async () => {
        if (saving) return;
        setSaving(true);
        try {
            const trimmed = name.trim() || collection.name;
            if (trimmed !== collection.name) await LibraryService.updateCollection(collection.id, { name: trimmed });
            await LibraryService.updateSmartFilter(collection.id, toSmartFilter(filter));
            await LibraryService.loadCollections();
            notify({ message: `Умная коллекция «${trimmed}» обновлена`, type: 'success' });
            onClose();
        } catch (e) {
            notify({ message: `Не удалось сохранить: ${e.message}`, type: 'danger' });
            setSaving(false);
        }
    }, [saving, name, filter, collection, onClose]);

    return (
        <div className="settings-overlay" onMouseDown={onClose}>
            <div className="settings-modal smart-editor" onMouseDown={e => e.stopPropagation()}>
                <div className="settings-header">
                    <i className="bi bi-funnel-fill me-2" />
                    <span>Умная коллекция</span>
                    <button className="settings-close" onClick={onClose} title="Закрыть">
                        <i className="bi bi-x-lg" />
                    </button>
                </div>

                <div className="settings-body">
                    <div className="adv-fields">
                        <div className="adv-row">
                            <span className="adv-label">Название</span>
                            <input
                                className="form-control form-control-sm"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </div>
                        <div className="adv-row">
                            <span className="adv-label">Поиск</span>
                            <input
                                className="form-control form-control-sm"
                                placeholder="в названии / имени файла"
                                value={filter.search}
                                onChange={e => patch({ search: e.target.value })}
                            />
                        </div>
                        <div className="adv-row">
                            <span className="adv-label">Теги</span>
                            <div className="smart-editor-tags">
                                <TagFilterInput
                                    filters={filter}
                                    addTag={addTag}
                                    removeTag={removeTag}
                                    toggleTagExclude={toggleTagExclude}
                                />
                            </div>
                        </div>
                        <div className="adv-row">
                            <span className="adv-label">Рейтинг</span>
                            <div className="adv-inline">
                                <select
                                    className="form-select form-select-sm adv-num"
                                    value={filter.ratingMin}
                                    onChange={e => {
                                        const v = Number(e.target.value);
                                        patch({ ratingMin: v, ratingMax: Math.max(v, filter.ratingMax) });
                                    }}
                                >
                                    {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <span className="adv-dash">—</span>
                                <select
                                    className="form-select form-select-sm adv-num"
                                    value={filter.ratingMax}
                                    onChange={e => {
                                        const v = Number(e.target.value);
                                        patch({ ratingMax: v, ratingMin: Math.min(v, filter.ratingMin) });
                                    }}
                                >
                                    {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <span className="adv-hint">0–0 — только без оценки</span>
                            </div>
                        </div>
                    </div>

                    <div className="smart-editor-divider" />
                    <AdvancedFilterFields value={filter} onChange={patch} />

                    <div className="smart-editor-divider" />
                    <div className="rb-title">
                        <i className="bi bi-diagram-3" /> Условия с группами
                        <span>«все / любое», вложенные группы, источник, просмотры</span>
                    </div>
                    <RuleBuilder
                        value={filter.rules}
                        onChange={rules => setFilter(prev => ({ ...prev, rules }))}
                    />
                </div>

                <div className="settings-footer">
                    <span className="smart-editor-count">
                        {matches == null
                            ? <><i className="bi bi-arrow-repeat spin me-1" />Считаю…</>
                            : <>Подходит: <b>{matches}</b></>}
                    </span>
                    <button className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={saving}>
                        Отмена
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
                        <i className="bi bi-check2 me-1" />Сохранить
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SmartFilterEditor;
