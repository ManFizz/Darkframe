import React, {useEffect, useRef, useState} from 'react';
import {libraryApi} from '@/Infrastructure/Ipc';

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
    const [query, setQuery]             = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading]         = useState(false);
    const inputRef                      = useRef(null);
    const recentTags                    = loadRecentTags().filter(t => !currentTags.includes(t));

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
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { handleAdd(query.trim().toLowerCase()); setQuery(''); inputRef.current?.focus(); }}
                    >
                        <i className="bi bi-plus-circle me-1" />
                        Создать «{query.trim().toLowerCase()}»
                    </div>
                )}

                {!loading && visibleSuggestions.map(tag => {
                    const name  = typeof tag === 'string' ? tag : tag.name;
                    const typeN = typeof tag === 'string' ? null : tag.type;
                    return (
                        <div
                            key={name}
                            className="tag-dropdown-item"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { handleAdd(name); setQuery(''); inputRef.current?.focus(); }}
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
    const [open, setOpen] = useState(false);
    const wrapperRef      = useRef(null);

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

export default TagEditor;
