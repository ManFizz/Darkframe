import React, {useCallback, useEffect, useRef, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {useCollections} from '@hooks/useCollections';
import {libraryApi} from '@/Infrastructure/Ipc';

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

const RECENT_TAGS_KEY = 'jsg_recent_tags';
const RECENT_LIMIT = 12;

function loadRecentTags() {
    try { return JSON.parse(localStorage.getItem(RECENT_TAGS_KEY) || '[]'); }
    catch { return []; }
}

function saveRecentTag(tag) {
    const recent = loadRecentTags().filter(t => t !== tag);
    recent.unshift(tag);
    localStorage.setItem(RECENT_TAGS_KEY, JSON.stringify(recent.slice(0, RECENT_LIMIT)));
}

const TagDropdown = ({ currentTags, onAdd, onClose }) => {
    const [query, setQuery]           = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading]       = useState(false);
    const inputRef                    = useRef(null);
    const recentTags                  = loadRecentTags().filter(t => !currentTags.includes(t));

    useEffect(() => { inputRef.current?.focus(); }, []);

    const lastQueryRef = useRef('');
    useEffect(() => {
        if (!query.trim()) { setSuggestions([]); setLoading(false); return; }

        const timer = setTimeout(async () => {
            const currentQuery = query.trim();
            lastQueryRef.current = currentQuery;

            setLoading(true);
            try {
                const results = await libraryApi.searchTags(currentQuery);

                // Игнорируем устаревшие ответы
                if (lastQueryRef.current !== currentQuery) return;

                setSuggestions(results.filter(t => !currentTags.includes(t.name)));
            } catch (e) {
                console.error('[TagDropdown] error:', e);
            } finally {
                if (lastQueryRef.current === currentQuery) setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const handleAdd = (tag) => {
        saveRecentTag(tag);
        onAdd(tag);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && query.trim()) {
            handleAdd(query.trim().toLowerCase());
            setQuery('');
        }
        if (e.key === 'Escape') onClose();
    };

    const visibleSuggestions = query.trim() ? suggestions : recentTags;
    const isEmpty = visibleSuggestions.length === 0 && !loading;

    return (
        <div className="tag-dropdown">
            <div className="tag-dropdown-search">
                <i className="bi bi-search" />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Поиск или новый тег..."
                    className="tag-dropdown-input"
                />
            </div>

            {!query.trim() && recentTags.length > 0 && (
                <div className="tag-dropdown-section-label">Последние</div>
            )}
            {query.trim() && suggestions.length > 0 && (
                <div className="tag-dropdown-section-label">Результаты</div>
            )}

            <div className="tag-dropdown-list">
                {loading && (
                    <div className="tag-dropdown-empty">
                        <i className="bi bi-arrow-repeat spin" /> Поиск...
                    </div>
                )}

                {!loading && isEmpty && query.trim() && (
                    <div
                        className="tag-dropdown-item tag-dropdown-create"
                        onClick={() => { handleAdd(query.trim().toLowerCase()); setQuery(''); }}
                    >
                        <i className="bi bi-plus-circle me-1" />
                        Создать «{query.trim().toLowerCase()}»
                    </div>
                )}

                {!loading && visibleSuggestions.map(tag => {
                    const name   = typeof tag === 'string' ? tag : tag.name;
                    const typeN  = typeof tag === 'string' ? null : tag.type;
                    return (
                        <div
                            key={name}
                            className="tag-dropdown-item"
                            onClick={() => { handleAdd(name); setQuery(''); }}
                        >
                            {typeN != null && (
                                <span className={`tag-dot tag-type-${typeN}`} />
                            )}
                            <span>{name}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const TagEditor = ({ tags, onChange }) => {
    const [open, setOpen]     = useState(false);
    const wrapperRef          = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const addTag = (tag) => {
        const t = tag.trim().toLowerCase();
        if (!t || tags.includes(t)) return;
        onChange([...tags, t]);
    };

    const removeTag = (tag) => onChange(tags.filter(t => t !== tag));

    return (
        <div className="tag-editor-eagle" ref={wrapperRef}>
            <div className="tag-editor-eagle-tags">
                {tags.map(tag => (
                    <span key={tag} className="tag-chip">
                        {tag}
                        <i className="bi bi-x" onClick={() => removeTag(tag)} />
                    </span>
                ))}
                <button
                    className="tag-chip tag-chip-add"
                    onClick={() => setOpen(v => !v)}
                    title="Добавить тег"
                >
                    <i className="bi bi-plus" />
                </button>
            </div>

            {open && (
                <TagDropdown
                    currentTags={tags}
                    onAdd={addTag}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
};

const CollectionPicker = ({ currentCollectionId, onChange }) => {
    const { tree } = useCollections();
    const [open, setOpen] = useState(false);
    const ref             = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Flatten tree for display
    const flatten = (nodes, depth = 0) => nodes.flatMap(n => [
        { id: n.id, name: n.name, depth },
        ...flatten(n.children || [], depth + 1),
    ]);

    const flat    = flatten(tree);
    const current = flat.find(c => c.id === currentCollectionId);

    return (
        <div className="collection-picker" ref={ref}>
            <button
                className="collection-picker-trigger"
                onClick={() => setOpen(v => !v)}
            >
                <i className="bi bi-folder me-1" />
                <span>{current?.name || 'Без коллекции'}</span>
                <i className="bi bi-chevron-down ms-auto" />
            </button>

            {open && (
                <div className="collection-picker-dropdown">
                    <div
                        className={`collection-picker-item ${!currentCollectionId ? 'active' : ''}`}
                        onClick={() => { onChange(null); setOpen(false); }}
                    >
                        <i className="bi bi-inbox me-2" />
                        Без коллекции
                    </div>
                    {flat.map(col => (
                        <div
                            key={col.id}
                            className={`collection-picker-item ${col.id === currentCollectionId ? 'active' : ''}`}
                            style={{ paddingLeft: 12 + col.depth * 14 }}
                            onClick={() => { onChange(col.id); setOpen(false); }}
                        >
                            <i className="bi bi-folder me-2" />
                            {col.name}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const MetadataPanel = ({ file, onUpdated }) => {
    const [form, setForm]   = useState(null);
    const [dirty, setDirty] = useState(false);
    const [activeTab, setActiveTab] = useState('info');

    const saveTimeout = useRef(null);
    const pendingFormRef = useRef(null);
    useEffect(() => {
        const prevFile = fileRef.current;
        const prevForm = pendingFormRef.current;

        if (prevFile && prevForm && prevFile.id !== file?.id) {
            clearTimeout(saveTimeout.current);
            console.log('[switch] saving previous file:', prevFile.id);
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
        setDirty(false);
    }, [file?.id]);

    const fileRef = useRef(file);
    useEffect(() => { fileRef.current = file; }, [file]);
    const update = useCallback((field, value) => {
        setForm(prev => {
            const next = { ...prev, [field]: value };
            pendingFormRef.current = next;

            clearTimeout(saveTimeout.current);

            const scheduledFileId = fileRef.current?.id;

            saveTimeout.current = setTimeout(async () => {
                const currentFile = fileRef.current;
                const currentForm = pendingFormRef.current;

                if (!currentFile || !currentForm || currentFile.id !== scheduledFileId) {
                    console.log('[autosave] skipped — file changed');
                    return;
                }

                console.log('[autosave] saving file:', currentFile.id, 'tags:', currentForm.tags);

                try {
                    await LibraryService.updateItem(currentFile.id, currentForm);
                    onUpdated?.(currentFile.id, currentForm);
                } catch (e) {
                    console.error('Autosave failed:', e);
                }
            }, 800);

            return next;
        });
        setDirty(true);
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
            {/* Preview */}
            <div className="metadata-preview">
                {file.type === 'video'
                    ? <video src={file.thumbUrl} muted loop autoPlay />
                    : <img src={file.thumbUrl} alt={file.title} />
                }
            </div>

            {/* Tabs */}
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
                    {/* Rating */}
                    <div className="metadata-section">
                        <label>Рейтинг</label>
                        <RatingStars value={form.rating} onChange={v => { update('rating', v); }} />
                    </div>

                    {/* Title */}
                    <div className="metadata-section">
                        <label>Название</label>
                        <input
                            className="form-control form-control-sm"
                            value={form.title}
                            onChange={e => update('title', e.target.value)}
                        />
                    </div>

                    {/* Tags */}
                    <div className="metadata-section">
                        <label>Теги</label>
                        <TagEditor
                            tags={form.tags}
                            onChange={v => update('tags', v)}
                        />
                    </div>

                    {/* Collection */}
                    <div className="metadata-section">
                        <label>Коллекция</label>
                        <CollectionPicker
                            currentCollectionId={form.collectionId}
                            onChange={v => { update('collectionId', v); }}
                        />
                    </div>

                    {/* Source */}
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

                    {/* Notes */}
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

            {/* Footer */}
            <div className="metadata-footer">
                {/*saving && (
                    <span className="metadata-saving">
                        <i className="bi bi-arrow-repeat spin me-1" />
                        Сохранение...
                    </span>
                )*/}
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