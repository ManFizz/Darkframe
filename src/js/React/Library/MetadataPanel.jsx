import React, {useCallback, useEffect, useState} from 'react';
import LibraryService from '../../Services/LibraryService';
import LibraryTagEditor from './LibraryTagEditor';

const RatingStars = ({ value, onChange }) => (
    <div className="rating-stars">
        {[1, 2, 3, 4, 5].map(star => (
            <i
                key={star}
                className={`bi bi-star${star <= value ? '-fill' : ''}`}
                onClick={() => onChange(star === value ? 0 : star)}
            />
        ))}
    </div>
);

const TagEditor = ({ tags, onChange }) => {
    const [input, setInput] = useState('');

    const addTag = (tag) => {
        const trimmed = tag.trim().toLowerCase();
        if (!trimmed || tags.includes(trimmed)) return;
        onChange([...tags, trimmed]);
        setInput('');
    };

    const removeTag = (tag) => onChange(tags.filter(t => t !== tag));

    return (
        <div className="tag-editor">
            <div className="tag-editor-list">
                {tags.map(tag => (
                    <span key={tag} className="badge bg-secondary me-1 mb-1">
                        {tag}
                        <i
                            className="bi bi-x ms-1"
                            onClick={() => removeTag(tag)}
                        />
                    </span>
                ))}
            </div>
            <input
                className="form-control form-control-sm mt-1"
                value={input}
                placeholder="Добавить тег..."
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        addTag(input);
                    }
                    if (e.key === 'Backspace' && !input && tags.length) {
                        removeTag(tags[tags.length - 1]);
                    }
                }}
            />
        </div>
    );
};

const MetadataPanel = ({ file, onUpdated, onClose }) => {
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (!file) return;
        setForm({
            title:     file.title || '',
            sourceUrl: file.sourceUrl || '',
            notes:     file.notes || '',
            rating:    file.rating || 0,
            tags:      Array.isArray(file.tags) ? [...file.tags] : [],
        });
        setDirty(false);
    }, [file?.id]);

    const update = useCallback((field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setDirty(true);
    }, []);

    const save = useCallback(async () => {
        if (!dirty || !file) return;
        setSaving(true);
        try {
            await LibraryService.updateItem(file.id, form);
            onUpdated?.(file.id, form);
            setDirty(false);
        } catch (e) {
            console.error('Save failed:', e);
        } finally {
            setSaving(false);
        }
    }, [file, form, dirty, onUpdated]);

    useEffect(() => {
        return () => { if (dirty) save(); };
    }, [file?.id]);

    if (!file || !form) return (
        <div className="metadata-panel metadata-panel-empty">
            <p>Выбери файл для просмотра метаданных</p>
        </div>
    );

    return (
        <div className="metadata-panel">
            <div className="metadata-panel-header">
                <span className="metadata-filename">{file.fileName || file.title}</span>
                <i className="bi bi-x-lg" onClick={onClose} />
            </div>

            <div className="metadata-preview">
                <img src={file.thumbUrl} alt={file.title} />
            </div>

            <div className="metadata-info">
                {file.width > 0 && (
                    <span>{file.width} × {file.height}</span>
                )}
                {file.size > 0 && (
                    <span>{formatSize(file.size)}</span>
                )}
                {file.duration && (
                    <span>{formatDuration(file.duration)}</span>
                )}
            </div>

            <div className="metadata-section">
                <label>Рейтинг</label>
                <RatingStars
                    value={form.rating}
                    onChange={v => update('rating', v)}
                />
            </div>

            <div className="metadata-section">
                <label>Название</label>
                <input
                    className="form-control form-control-sm"
                    value={form.title}
                    onChange={e => update('title', e.target.value)}
                    onBlur={save}
                />
            </div>

            <div className="metadata-section">
                <label>Теги</label>
                <LibraryTagEditor
                    tags={form.tags}
                    onChange={v => update('tags', v)}
                />
            </div>

            <div className="metadata-section">
                <label>Источник</label>
                <div className="input-group input-group-sm">
                    <input
                        className="form-control"
                        value={form.sourceUrl}
                        onChange={e => update('sourceUrl', e.target.value)}
                        onBlur={save}
                        placeholder="https://..."
                    />
                    {form.sourceUrl && (
                        <a
                        className="btn btn-outline-secondary"
                        href={form.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        >
                        <i className="bi bi-box-arrow-up-right" />
                        </a>
                        )}
                </div>
            </div>

            <div className="metadata-section">
                <label>Заметки</label>
                <textarea
                    className="form-control form-control-sm"
                    rows={3}
                    value={form.notes}
                    onChange={e => update('notes', e.target.value)}
                    onBlur={save}
                    placeholder="Заметки..."
                />
            </div>

            <div className="metadata-actions">
                <button
                    className="btn btn-primary btn-sm"
                    onClick={save}
                    disabled={!dirty || saving}
                >
                    {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => onUpdated?.('delete', file.id)}
                >
                    <i className="bi bi-trash me-1" />
                    Удалить
                </button>
            </div>
        </div>
    );
};

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

export default MetadataPanel;