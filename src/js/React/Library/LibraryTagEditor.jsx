import React, {useCallback, useRef, useState} from 'react';
import {libraryApi} from '@/Infrastructure/Ipc';

const LibraryTagEditor = ({ tags, onChange }) => {
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const lastQueryRef = useRef('');
    const wrapperRef = useRef(null);

    const handleInput = useCallback(async (val) => {
        setInput(val);
        lastQueryRef.current = val;

        if (val.length < 1) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }

        const list = await libraryApi.searchTags(val);
        if (lastQueryRef.current !== val) return;

        setSuggestions(list);
        setShowDropdown(list.length > 0);
    }, []);

    const addTag = useCallback((name) => {
        const trimmed = name.trim().toLowerCase();
        if (!trimmed || tags.includes(trimmed)) return;
        onChange([...tags, trimmed]);
        setInput('');
        setSuggestions([]);
        setShowDropdown(false);
    }, [tags, onChange]);

    const removeTag = useCallback((tag) => {
        onChange(tags.filter(t => t !== tag));
    }, [tags, onChange]);

    return (
        <div className="library-tag-editor" ref={wrapperRef}>
            <div className="tag-editor-list">
                {tags.map(tag => (
                    <span key={tag} className="badge bg-secondary me-1 mb-1">
                        {tag}
                        <i
                            className="bi bi-x ms-1"
                            style={{ cursor: 'pointer' }}
                            onClick={() => removeTag(tag)}
                        />
                    </span>
                ))}
            </div>

            <div className="tag-input-wrapper">
                <input
                    className="form-control form-control-sm"
                    value={input}
                    placeholder="Добавить тег..."
                    onChange={e => handleInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            addTag(input);
                        }
                        if (e.key === 'Backspace' && !input && tags.length) {
                            removeTag(tags[tags.length - 1]);
                        }
                        if (e.key === 'Escape') {
                            setShowDropdown(false);
                        }
                    }}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                />

                {showDropdown && (
                    <ul className="tag-suggestions-dropdown">
                        {suggestions.map(s => (
                            <li
                                key={s.name}
                                className={`tag-suggestion-item ${s.type != null ? `tag-type-${s.type}` : ''}`}
                                onMouseDown={() => addTag(s.name)}
                            >
                                {s.name}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default LibraryTagEditor;