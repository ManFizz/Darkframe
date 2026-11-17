import React, {useCallback, useEffect, useRef, useState} from 'react';
import {confirmDeleteForever} from '@services/deleteForever';
import LibraryService from '@services/LibraryService';
import {libraryApi} from '@/Infrastructure/Ipc';
import {isWeb} from '@/Infrastructure/electron';
import RatingStars from './RatingStars';
import TagEditor from './TagEditor';
import SuggestTags from './SuggestTags';
import MangaInfo from '../../Manga/MangaInfo';
import CollectionPicker from '../Collection/CollectionPicker';
import RelatedBlock, {RelatedHint, SearchByThisButton, useRelations} from './RelatedBlock';

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
    const relations = useRelations(file?.isManga ? null : file);

    const fileRef        = useRef(file);
    const saveTimeout    = useRef(null);
    const pendingFormRef = useRef(null);

    const onUpdatedRef = useRef(onUpdated);
    useEffect(() => { onUpdatedRef.current = onUpdated; });

    useEffect(() => {
        const prevFile = fileRef.current;
        const prevForm = pendingFormRef.current;

        clearTimeout(saveTimeout.current);

        if (prevFile && prevForm && prevFile.id !== file?.id) {
            LibraryService.updateItem(prevFile.id, prevForm)
                .then(() => onUpdatedRef.current?.(prevFile.id, prevForm))
                .catch(console.error);
        }

        fileRef.current = file;
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

    // Reflect a rating changed from outside the panel (the modal's number-key
    // shortcut) without clobbering an edit the user is still typing.
    useEffect(() => {
        if (!file || pendingFormRef.current) return;
        setForm(prev =>
            prev && prev.rating !== (file.rating || 0)
                ? { ...prev, rating: file.rating || 0 }
                : prev
        );
    }, [file?.rating]);

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
                    if (pendingFormRef.current === currentForm) pendingFormRef.current = null;
                    onUpdated?.(currentFile.id, currentForm);
                } catch (e) {
                    console.error('Autosave failed:', e);
                }
            }, 800);

            return next;
        });
    }, [onUpdated]);

    useEffect(() => {
        return () => {
            clearTimeout(saveTimeout.current);

            const lastFile = fileRef.current;
            const lastForm = pendingFormRef.current;
            if (!lastFile || !lastForm) return;

            LibraryService.updateItem(lastFile.id, lastForm)
                .then(() => onUpdatedRef.current?.(lastFile.id, lastForm))
                .catch(console.error);
        };
    }, []);

    if (!file || !form) return (
        <div className="metadata-panel">
            <div className="metadata-panel-empty">
                <i aria-hidden="true" className="bi bi-cursor-fill" />
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
                        <i aria-hidden="true" className={`bi bi-${tab === 'info' ? 'info-circle' : 'file-earmark'} me-1`} />
                        {tab === 'info' ? 'Инфо' : 'Файл'}
                    </button>
                ))}
            </div>

            {activeTab === 'info' && (
                <div className="metadata-content">
                    {file.isManga && <MangaInfo file={file} onChanged={() => onUpdated?.('refresh')} />}
                    <div className="metadata-section">
                        <label>Рейтинг</label>
                        <RatingStars value={form.rating} onChange={v => update('rating', v)} />
                    </div>
                    {!file.isManga && <RelatedBlock file={file} data={relations.data} reload={relations.reload} onChanged={() => onUpdated?.('refresh')} />}

                    <div className="metadata-section">
                        <label>Название</label>
                        <input
                            className="form-control form-control-sm"
                            value={form.title}
                            onChange={e => update('title', e.target.value)}
                        />
                    </div>

                    <div className="metadata-section">
                        <SuggestTags file={file} label="Теги" onAdd={(names) => update('tags', [...new Set([...(form.tags || []), ...names])])}>
                            <TagEditor tags={form.tags} onChange={v => update('tags', v)} />
                        </SuggestTags>
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
                                    <i aria-hidden="true" className="bi bi-box-arrow-up-right" />
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

                    {!file.isManga && (
                        <div className="metadata-section metadata-tail">
                            <RelatedHint file={file} data={relations.data} />
                            <SearchByThisButton file={file} />
                        </div>
                    )}
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

                    {!isWeb && <div className="metadata-section">
                        <button
                            className="btn btn-sm btn-outline-secondary w-100"
                            onClick={() => libraryApi.revealItem({ id: file.id })}
                        >
                            <i aria-hidden="true" className="bi bi-folder2-open me-1" />
                            Показать в проводнике
                        </button>
                    </div>}
                </div>
            )}

            <div className="metadata-footer">
                {file.deletedAt && (
                    <button
                        className="btn btn-outline-success btn-sm"
                        title="Восстановить из корзины"
                        onClick={() => onUpdated?.('restore', file.id)}
                    >
                        <i aria-hidden="true" className="bi bi-arrow-counterclockwise" />
                    </button>
                )}
                <button
                    className="btn btn-outline-danger btn-sm"
                    title={file.deletedAt ? 'Удалить навсегда' : 'В корзину · Shift — удалить навсегда'}
                    onClick={(e) => {
                        if (e.shiftKey && !file.deletedAt) {
                            if (confirmDeleteForever(1, file.title)) onUpdated?.('deleteForever', file.id);
                        } else onUpdated?.('delete', file.id);
                    }}
                >
                    <i aria-hidden="true" className={`bi ${file.deletedAt ? 'bi-trash3' : 'bi-trash'}`} />
                </button>
            </div>
        </div>
    );
};

export default MetadataPanel;
