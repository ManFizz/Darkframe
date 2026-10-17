import React, {useEffect, useRef, useState} from 'react';
import {libraryApi} from '@/Infrastructure/Ipc';
import {recordTagUse, useTagPrefs} from '@services/tagPrefs';
import {useTagTypeMenu} from './TagTypeMenu';

const FREQUENT_LIMIT = 12;

// Split a pasted string into individual tags. Primary separator is ";" (what the
// browser userscripts emit), newlines also count. Stray backslashes are stripped
// so a literal "\;" separator degrades gracefully to ";". Everything is trimmed,
// lowercased and de-duplicated; spaces are NOT separators (multi-word tags survive).
export function splitTags(raw) {
    const seen = new Set();
    const out = [];
    for (const piece of String(raw).split(/[;\n]+/)) {
        const t = piece.replace(/\\/g, '').trim().toLowerCase();
        if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    }
    return out;
}

const TagDropdown = ({ currentTags, onAdd, onClose }) => {
    const [query, setQuery]             = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading]         = useState(false);
    const inputRef                      = useRef(null);
    const prefs                         = useTagPrefs();

    // Empty query → pinned first, then the tags you add most often.
    const pinnedTags   = prefs.pinned.filter(t => !currentTags.includes(t));
    const frequentList = prefs.frequent(FREQUENT_LIMIT, [...currentTags, ...prefs.pinned]);

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
        // A single paste may carry many tags — count each one.
        recordTagUse(splitTags(tag));
        onAdd(tag);
    };

    const pick = (name) => { handleAdd(name); setQuery(''); inputRef.current?.focus(); };

    const renderItem = (tag, pinnedMark) => {
        const name  = typeof tag === 'string' ? tag : tag.name;
        const typeN = typeof tag === 'string' ? null : tag.type;
        const isPinned = pinnedMark || (typeof tag !== 'string' && tag.pinned);
        return (
            <div
                key={name}
                className="tag-dropdown-item"
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(name)}
            >
                {typeN != null && <span className={`tag-dot tag-type-${typeN}`} />}
                <span>{name}</span>
                {isPinned && <i className="bi bi-pin-angle-fill tag-pin-mark" />}
            </div>
        );
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && query.trim()) {
            handleAdd(query.trim().toLowerCase());
            setQuery('');
        }
        if (e.key === 'Escape') onClose();
    };

    const hasQuery = !!query.trim();
    const isEmpty = hasQuery && suggestions.length === 0 && !loading;

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

            <div className="tag-dropdown-list">
                {hasQuery ? (
                    <>
                        {suggestions.length > 0 && <div className="tag-dropdown-section-label">Результаты</div>}
                        {loading && (
                            <div className="tag-dropdown-empty">
                                <i className="bi bi-arrow-repeat spin" /> Поиск...
                            </div>
                        )}
                        {isEmpty && (
                            <div
                                className="tag-dropdown-item tag-dropdown-create"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => pick(query.trim().toLowerCase())}
                            >
                                <i className="bi bi-plus-circle me-1" />
                                Создать «{query.trim().toLowerCase()}»
                            </div>
                        )}
                        {!loading && suggestions.map(tag => renderItem(tag, false))}
                    </>
                ) : (
                    <>
                        {pinnedTags.length > 0 && <div className="tag-dropdown-section-label">Закреплённые</div>}
                        {pinnedTags.map(name => renderItem(name, true))}
                        {frequentList.length > 0 && <div className="tag-dropdown-section-label">Частые</div>}
                        {frequentList.map(name => renderItem(name, false))}
                    </>
                )}
            </div>
        </div>
    );
};

const TagEditor = ({ tags, onChange }) => {
    const {onTagContextMenu, tagTypeMenu} = useTagTypeMenu();
    const [open, setOpen] = useState(false);
    const wrapperRef      = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const addTag = (raw) => {
        // Accept a whole separated string ("a; b; c") and expand it into tags.
        const incoming = splitTags(raw).filter(t => !tags.includes(t));
        if (!incoming.length) return;
        onChange([...tags, ...incoming]);
    };

    const removeTag = (tag) => onChange(tags.filter(t => t !== tag));

    return (
        <div className="tag-editor-eagle" ref={wrapperRef}>
            {tagTypeMenu}
            <div className="tag-editor-eagle-tags">
                {tags.map(tag => (
                    <span key={tag} className="tag-chip" onContextMenu={e => onTagContextMenu(e, tag)}>
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
