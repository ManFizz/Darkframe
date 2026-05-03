import React, {useRef, useState} from 'react';
import {SORT_FIELDS, SORT_ORDER} from '../../Hooks/useLibraryFilter';

const RatingFilter = ({ value, onChange }) => (
    <div className="filter-rating">
        <span className="filter-label">Рейтинг</span>
        <div className="rating-stars">
            {[1, 2, 3, 4, 5].map(star => (
                <i
                    key={star}
                    className={`bi bi-star${star <= value ? '-fill' : ''}`}
                    onClick={() => onChange(star === value ? 0 : star)}
                />
            ))}
        </div>
    </div>
);

const TagFilter = ({ tags, onAdd, onRemove }) => {
    const [input, setInput] = useState('');
    const inputRef = useRef(null);

    return (
        <div className="filter-tags">
            <span className="filter-label">Теги</span>
            <div className="filter-tags-list">
                {tags.map(tag => (
                    <span key={tag} className="badge bg-primary me-1 mb-1">
                        {tag}
                        <i
                            className="bi bi-x ms-1"
                            style={{ cursor: 'pointer' }}
                            onClick={() => onRemove(tag)}
                        />
                    </span>
                ))}
                <input
                    ref={inputRef}
                    className="filter-tag-input"
                    value={input}
                    placeholder="Тег..."
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onAdd(input);
                            setInput('');
                        }
                        if (e.key === 'Backspace' && !input && tags.length) {
                            onRemove(tags[tags.length - 1]);
                        }
                    }}
                />
            </div>
        </div>
    );
};

const LibraryFilters = ({ filters, onUpdate, onAddTag, onRemoveTag, onReset, total, filtered }) => {
    const hasActiveFilters =
        filters.search ||
        filters.tags.length > 0 ||
        filters.rating > 0;

    return (
        <div className="library-filters">
            <div className="filter-search">
                <div className="input-group input-group-sm">
                    <span className="input-group-text">
                        <i className="bi bi-search" />
                    </span>
                    <input
                        className="form-control"
                        placeholder="Поиск по названию..."
                        value={filters.search}
                        onChange={e => onUpdate('search', e.target.value)}
                    />
                    {filters.search && (
                        <button
                            className="btn btn-outline-secondary"
                            onClick={() => onUpdate('search', '')}
                        >
                            <i className="bi bi-x" />
                        </button>
                    )}
                </div>
            </div>

            <TagFilter
                tags={filters.tags}
                onAdd={onAddTag}
                onRemove={onRemoveTag}
            />

            <RatingFilter
                value={filters.rating}
                onChange={v => onUpdate('rating', v)}
            />

            <div className="filter-sort">
                <span className="filter-label">Сортировка</span>
                <div className="d-flex gap-1">
                    <select
                        className="form-select form-select-sm"
                        value={filters.sortBy}
                        onChange={e => onUpdate('sortBy', e.target.value)}
                    >
                        <option value={SORT_FIELDS.ORDER}>Порядок</option>
                        <option value={SORT_FIELDS.IMPORTED_AT}>Дата добавления</option>
                        <option value={SORT_FIELDS.TITLE}>Название</option>
                        <option value={SORT_FIELDS.RATING}>Рейтинг</option>
                        <option value={SORT_FIELDS.SIZE}>Размер</option>
                    </select>
                    <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => onUpdate('order',
                            filters.order === SORT_ORDER.DESC
                                ? SORT_ORDER.ASC
                                : SORT_ORDER.DESC
                        )}
                    >
                        <i className={`bi bi-sort-${filters.order === SORT_ORDER.DESC ? 'down' : 'up'}`} />
                    </button>
                </div>
            </div>

            {/* Статус и сброс */}
            <div className="filter-footer">
                <span className="filter-count">
                    {filtered} из {total}
                </span>
                {hasActiveFilters && (
                    <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={onReset}
                    >
                        Сбросить
                    </button>
                )}
            </div>
        </div>
    );
};

export default LibraryFilters;