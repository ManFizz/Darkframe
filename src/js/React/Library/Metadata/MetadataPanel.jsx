import React, {useCallback, useEffect, useRef, useState} from 'react';
import LibraryService from '@services/LibraryService';
import RatingStars from './RatingStars';
import TagEditor from './TagEditor';
import CollectionPicker from '../Collection/CollectionPicker';

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

const MetadataPanel = ({ file, onUpdated }) => {
    const [form, setForm]           = useState(null);
    const [activeTab, setActiveTab] = useState('info');

    const fileRef        = useRef(file);
    const saveTimeout    = useRef(null);
    const pendingFormRef = useRef(null);

    useEffect(() => { fileRef.current = file; }, [file]);

    useEffect(() => {
        const prevFile = fileRef.current;
        const prevForm = pendingFormRef.current;

        if (prevFile && prevForm && prevFile.id !== file?.id) {
            clearTimeout(saveTimeout.current);
            LibraryService.updateItem(prevFile.id, prevForm)
                .then(() => onUpdated?.(prevFile.id, prevForm))
                .catch(console.error);
        } else {
            clearTimeout(saveTimeout.current);
        }

        pendingFormRef.current = null;

        if (!file) { setForm(null); return; }
        setForm({
            title:        file.title || '',
            sourceUrl:    file.sourceUrl || '',
            notes:        file.notes || '',
            rating:       file.rating || 0,
            tags:         Array.isArray(file.tags) ? [...file.tags] : [],
            collectionId: file.collectionId || null,
        });
    }, [file?.id]);

    const update = useCallback((field, value) => {
        setForm(prev => {
            const next = { ...prev, [field]: value };
            pendingFormRef.current = next;

            clearTimeout(saveTimeout.current);

            const scheduledFileId = fileRef.current?.id;

            saveTimeout.current = setTimeout(async () => {
                const currentFile = fileRef.current;
                const currentForm = pendingFormRef.current;

                if (!currentFile || !currentForm || currentFile.id !== scheduledFileId) return;

                try {
                    await LibraryService.updateItem(currentFile.id, currentForm);
                    onUpdated?.(currentFile.id, currentForm);
                } catch (e) {
                    console.error('Autosave failed:', e);
                }
            }, 800);

            return next;
        });
    }, [onUpdated]);

    useEffect(() => {
        return () => clearTimeout(saveTimeout.current);
    }, []);

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
            <div className="metadata-preview">
                {file.type === 'video'
                    ? <video src={file.thumbUrl} muted loop autoPlay />
                    : <img src={file.thumbUrl} alt={file.title} />
                }
            </div>

            <div className="metadata-tabs">
                {['info', 'file'].map(tab => (
                    <button
                        key={tab}
                        className={`metadata-tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        <i className={`bi bi-${tab === 'info' ? 'info-circle' : 'file-earmark'} me-1`} />
                        {tab === 'info' ? 'Инфо' : 'Файл'}
                    </button>
                ))}
            </div>

            {activeTab === 'info' && (
                <div className="metadata-content">
                    <div className="metadata-section">
                        <label>Рейтинг</label>
                        <RatingStars value={form.rating} onChange={v => update('rating', v)} />
                    </div>

                    <div className="metadata-section">
                        <label>Название</label>
                        <input
                            className="form-control form-control-sm"
                            value={form.title}
                            onChange={e => update('title', e.target.value)}
                        />
                    </div>

                    <div className="metadata-section">
                        <label>Теги</label>
                        <TagEditor tags={form.tags} onChange={v => update('tags', v)} />
                    </div>

                    <div className="metadata-section">
                        <label>Коллекция</label>
                        <CollectionPicker
                            currentCollectionId={form.collectionId}
                            onChange={v => update('collectionId', v)}
                        />
                    </div>

                    <div className="metadata-section">
                        <label>Источник</label>
                        <div className="input-group input-group-sm">
                            <input
                                className="form-control"
                                value={form.sourceUrl}
                                onChange={e => update('sourceUrl', e.target.value)}
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
                            placeholder="Заметки..."
                        />
                    </div>
                </div>
            )}

            {activeTab === 'file' && (
                <div className="metadata-content">
                    {[
                        ['Размер', formatSize(file.size)],
                        file.width > 0 && ['Разрешение', `${file.width} × ${file.height}`],
                        file.duration && ['Длительность', formatDuration(file.duration)],
                        ['Добавлен', file.time ? new Date(file.time * 1000).toLocaleDateString('ru-RU') : '—'],
                        ['Имя файла', file.title],
                    ].filter(Boolean).map(([lbl, val]) => (
                        <div key={lbl} className="metadata-section">
                            <label>{lbl}</label>
                            <span className="metadata-value">{val}</span>
                        </div>
                    ))}

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

            <div className="metadata-footer">
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

export default MetadataPanel;
