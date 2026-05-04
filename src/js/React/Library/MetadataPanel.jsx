// MetadataPanel.jsx
import React, {useCallback, useEffect, useState} from 'react';
import LibraryService from '@services/LibraryService';
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

const MetadataPanel = ({ file, onUpdated }) => {
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [activeTab, setActiveTab] = useState('info'); // 'info' | 'file'

    useEffect(() => {
        if (!file) { setForm(null); return; }
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

    // Автосохранение при смене файла
    useEffect(() => {
        return () => { if (dirty) save(); };
    }, [file?.id]);

    // Пустое состояние
    if (!file || !form) return (
        <div className="metadata-panel">
            <div className="metadata-panel-empty">
                <i className="bi bi-cursor-fill" />
                <span>Выбери файл</span>
            </div>
        </div>
    );

    return (
        <div className="metadata-panel">
            {/* Превью */}
            <div className="metadata-preview">
                {file.type === 'video' ? (
                    <video src={file.thumbUrl} muted loop autoPlay />
                ) : (
                    <img src={file.thumbUrl} alt={file.title} />
                )}
            </div>

            {/* Табы */}
            <div className="metadata-tabs">
                <button
                    className={`metadata-tab ${activeTab === 'info' ? 'active' : ''}`}
                    onClick={() => setActiveTab('info')}
                >
                    <i className="bi bi-info-circle me-1" />
                    Инфо
                </button>
                <button
                    className={`metadata-tab ${activeTab === 'file' ? 'active' : ''}`}
                    onClick={() => setActiveTab('file')}
                >
                    <i className="bi bi-file-earmark me-1" />
                    Файл
                </button>
            </div>

            {activeTab === 'info' && (
                <div className="metadata-content">
                    {/* Рейтинг */}
                    <div className="metadata-section">
                        <label>Рейтинг</label>
                        <RatingStars value={form.rating} onChange={v => update('rating', v)} />
                    </div>

                    {/* Название */}
                    <div className="metadata-section">
                        <label>Название</label>
                        <input
                            className="form-control form-control-sm"
                            value={form.title}
                            onChange={e => update('title', e.target.value)}
                            onBlur={save}
                        />
                    </div>

                    {/* Теги */}
                    <div className="metadata-section">
                        <label>Теги</label>
                        <LibraryTagEditor
                            tags={form.tags}
                            onChange={v => { update('tags', v); }}
                        />
                        {dirty && (
                            <button
                                className="btn btn-xs btn-outline-primary mt-1"
                                onClick={save}
                            >
                                Сохранить теги
                            </button>
                        )}
                    </div>

                    {/* Источник */}
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

                    {/* Заметки */}
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
                </div>
            )}

            {activeTab === 'file' && (
                <div className="metadata-content">
                    {/* Технические данные */}
                    <div className="metadata-section">
                        <label>Размер файла</label>
                        <span className="metadata-value">{formatSize(file.size)}</span>
                    </div>

                    {file.width > 0 && (
                        <div className="metadata-section">
                            <label>Разрешение</label>
                            <span className="metadata-value">{file.width} × {file.height}</span>
                        </div>
                    )}

                    {file.duration && (
                        <div className="metadata-section">
                            <label>Длительность</label>
                            <span className="metadata-value">{formatDuration(file.duration)}</span>
                        </div>
                    )}

                    <div className="metadata-section">
                        <label>Добавлен</label>
                        <span className="metadata-value">
                            {file.time ? new Date(file.time * 1000).toLocaleDateString('ru-RU') : '—'}
                        </span>
                    </div>

                    <div className="metadata-section">
                        <label>Оригинальное имя</label>
                        <span className="metadata-value metadata-filename-full">{file.title}</span>
                    </div>

                    {/* Открыть в проводнике */}
                    <div className="metadata-section">
                        <button
                            className="btn btn-sm btn-outline-secondary w-100"
                            onClick={() => {
                                const { shell } = window.require('electron');
                                shell.showItemInFolder(file.contentUrl.replace('library://item/', ''));
                            }}
                        >
                            <i className="bi bi-folder2-open me-1" />
                            Показать в проводнике
                        </button>
                    </div>
                </div>
            )}

            {/* Футер — всегда виден */}
            <div className="metadata-footer">
                <button
                    className="btn btn-primary btn-sm"
                    onClick={save}
                    disabled={!dirty || saving}
                >
                    {saving ? (
                        <><i className="bi bi-arrow-repeat me-1" />Сохранение...</>
                    ) : (
                        <><i className="bi bi-check me-1" />Сохранить</>
                    )}
                </button>
                <button
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => onUpdated?.('delete', file.id)}
                >
                    <i className="bi bi-trash" />
                </button>
            </div>
        </div>
    );
};

function formatSize(bytes) {
    if (!bytes) return '—';
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