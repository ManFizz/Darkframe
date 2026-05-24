import React, {useCallback, useEffect, useMemo, useState} from 'react';
import LibraryService from '@services/LibraryService';
import TagEditor from './TagEditor';
import RatingStars from './RatingStars';
import CollectionPicker from '../Collection/CollectionPicker';

// null = mixed (разные значения у выделенных файлов)
function commonVal(items, getter) {
    const vals = [...new Set(items.map(getter))];
    return vals.length === 1 ? vals[0] : null;
}

const MIXED_PLACEHOLDER = 'Разные значения';

const BulkMetadataPanel = ({ items, onUpdated }) => {
    const commonTags = useMemo(() => {
        if (!items.length) return [];
        const first = items[0].tags || [];
        return first.filter(tag => items.every(f => (f.tags || []).includes(tag)));
    }, [items]);

    const commonCollectionId = useMemo(() => {
        const ids = [...new Set(items.map(f => f.collectionId ?? null))];
        return ids.length === 1 ? ids[0] : undefined;
    }, [items]);

    const commonRating  = useMemo(() => commonVal(items, f => f.rating  ?? 0),  [items]);
    const commonTitle   = useMemo(() => commonVal(items, f => f.title   ?? ''), [items]);
    const commonSource  = useMemo(() => commonVal(items, f => f.sourceUrl ?? ''), [items]);
    const commonNotes   = useMemo(() => commonVal(items, f => f.notes   ?? ''), [items]);

    // Локальный стейт текстовых полей — сбрасываем при смене выделения
    const itemsKey = items.map(f => f.id).join(',');
    const [title,  setTitle]  = useState(commonTitle  ?? '');
    const [source, setSource] = useState(commonSource ?? '');
    const [notes,  setNotes]  = useState(commonNotes  ?? '');

    useEffect(() => {
        setTitle(commonTitle   ?? '');
        setSource(commonSource ?? '');
        setNotes(commonNotes   ?? '');
    }, [itemsKey]);

    const applyField = useCallback(async (field, value) => {
        await LibraryService.bulkUpdateItems(
            items.map(f => ({ id: f.id, data: { [field]: value } }))
        );
        onUpdated?.();
    }, [items, onUpdated]);

    const handleTagChange = useCallback(async (newCommonTags) => {
        const added   = newCommonTags.filter(t => !commonTags.includes(t));
        const removed = commonTags.filter(t => !newCommonTags.includes(t));
        if (!added.length && !removed.length) return;

        await LibraryService.bulkUpdateItems(
            items.map(f => {
                let tags = [...(f.tags || [])];
                added.forEach(t => { if (!tags.includes(t)) tags.push(t); });
                removed.forEach(t => { tags = tags.filter(x => x !== t); });
                return { id: f.id, data: { tags } };
            })
        );
        onUpdated?.();
    }, [items, commonTags, onUpdated]);

    return (
        <div className="metadata-panel">
            <div className="metadata-panel-bulk-header">
                <i className="bi bi-collection" />
                <span>Выбрано: {items.length}</span>
            </div>

            <div className="metadata-content">
                <div className="metadata-section">
                    <label>Рейтинг</label>
                    <RatingStars
                        value={commonRating ?? 0}
                        onChange={v => applyField('rating', v)}
                    />
                    {commonRating === null && (
                        <span className="text-secondary" style={{fontSize: 11}}>Разные значения</span>
                    )}
                </div>

                <div className="metadata-section">
                    <label>Теги <span className="text-secondary" style={{fontWeight:400, fontSize:11}}>(общие)</span></label>
                    <TagEditor tags={commonTags} onChange={handleTagChange} />
                    {commonTags.length === 0 && (
                        <span className="text-secondary" style={{fontSize: 11}}>
                            Нет тегов у всех файлов
                        </span>
                    )}
                </div>

                <div className="metadata-section">
                    <label>Коллекция</label>
                    <CollectionPicker
                        currentCollectionId={commonCollectionId}
                        mixed={commonCollectionId === undefined}
                        onChange={v => applyField('collectionId', v)}
                    />
                </div>

                <div className="metadata-section">
                    <label>Название</label>
                    <input
                        className="form-control form-control-sm"
                        value={title}
                        placeholder={commonTitle === null ? MIXED_PLACEHOLDER : ''}
                        onChange={e => setTitle(e.target.value)}
                        onBlur={() => applyField('title', title)}
                    />
                </div>

                <div className="metadata-section">
                    <label>Источник</label>
                    <input
                        className="form-control form-control-sm"
                        value={source}
                        placeholder={commonSource === null ? MIXED_PLACEHOLDER : 'https://...'}
                        onChange={e => setSource(e.target.value)}
                        onBlur={() => applyField('sourceUrl', source)}
                    />
                </div>

                <div className="metadata-section">
                    <label>Заметки</label>
                    <textarea
                        className="form-control form-control-sm"
                        rows={3}
                        value={notes}
                        placeholder={commonNotes === null ? MIXED_PLACEHOLDER : 'Заметки...'}
                        onChange={e => setNotes(e.target.value)}
                        onBlur={() => applyField('notes', notes)}
                    />
                </div>
            </div>
        </div>
    );
};

export default BulkMetadataPanel;
