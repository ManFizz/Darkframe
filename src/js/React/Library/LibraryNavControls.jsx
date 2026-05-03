import React, {useState} from 'react';
import {SORT_FIELDS, SORT_ORDER} from '../../Hooks/useLibraryFilter'

export const LibraryNavControls = ({ ctx }) => {
    const { filters, update, addTag, removeTag } = ctx;
    const [tagInput, setTagInput] = useState('');

    return (
        <div className="d-flex align-items-center gap-2 flex-1 mx-3">
            {/* Поиск */}
            <div className="input-group input-group-sm" style={{ maxWidth: 220 }}>
                <span className="input-group-text">
                    <i className="bi bi-search" />
                </span>
                <input
                    className="form-control"
                    placeholder="Поиск..."
                    value={filters.search}
                    onChange={e => update('search', e.target.value)}
                />
                {filters.search && (
                    <button className="btn btn-outline-secondary" onClick={() => update('search', '')}>
                        <i className="bi bi-x" />
                    </button>
                )}
            </div>

            {/* Теги */}
            <div className="d-flex align-items-center gap-1 flex-wrap">
                {filters.tags.map(tag => (
                    <span key={tag} className="badge bg-primary">
                        {tag}
                        <i className="bi bi-x ms-1" style={{ cursor: 'pointer' }} onClick={() => removeTag(tag)} />
                    </span>
                ))}
                <input
                    className="form-control form-control-sm"
                    style={{ width: 90 }}
                    placeholder="Тег..."
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (tagInput.trim()) {
                                addTag(tagInput.trim());
                                setTagInput('');
                            }
                        }
                    }}
                />
            </div>

            {/* Счётчик */}
            <span className="text-secondary small text-nowrap">
                {ctx.filtered.length} / {ctx.total}
            </span>
        </div>
    );
};

// Сортировка в navbar для library
export const LibraryNavSort = ({ ctx }) => {
    const { filters, update, reset } = ctx;
    const hasFilters = filters.search || filters.tags.length > 0 || filters.rating > 0;

    return (
        <div className="d-flex btn-group">
            {/* Рейтинг */}
            <div className="btn-group dropdown">
                <button className="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                    {filters.rating > 0 ? `★ ${filters.rating}+` : 'Рейтинг'}
                </button>
                <ul className="dropdown-menu dropdown-menu-end">
                    <li>
                        <button className="dropdown-item" onClick={() => update('rating', 0)}>
                            Любой
                        </button>
                    </li>
                    {[1, 2, 3, 4, 5].map(r => (
                        <li key={r}>
                            <button className="dropdown-item" onClick={() => update('rating', r)}>
                                {'★'.repeat(r)} {r}+
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Сортировка */}
            <div className="btn-group dropdown">
                <button className="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                    {
                        {
                            [SORT_FIELDS.ORDER]:       'Порядок',
                            [SORT_FIELDS.IMPORTED_AT]: 'Дата',
                            [SORT_FIELDS.TITLE]:       'Название',
                            [SORT_FIELDS.RATING]:      'Рейтинг',
                            [SORT_FIELDS.SIZE]:        'Размер',
                        }[filters.sortBy]
                    }
                </button>
                <ul className="dropdown-menu dropdown-menu-end">
                    {[
                        [SORT_FIELDS.ORDER,       'Порядок'],
                        [SORT_FIELDS.IMPORTED_AT, 'Дата добавления'],
                        [SORT_FIELDS.TITLE,       'Название'],
                        [SORT_FIELDS.RATING,      'Рейтинг'],
                        [SORT_FIELDS.SIZE,        'Размер'],
                    ].map(([value, label]) => (
                        <li key={value}>
                            <button
                                className={`dropdown-item ${filters.sortBy === value ? 'active' : ''}`}
                                onClick={() => update('sortBy', value)}
                            >
                                {label}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Порядок */}
            <button
                className="btn btn-outline-secondary"
                onClick={() => update('order', filters.order === SORT_ORDER.DESC ? SORT_ORDER.ASC : SORT_ORDER.DESC)}
            >
                <i className={`bi bi-sort-${filters.order === SORT_ORDER.DESC ? 'down' : 'up'}`} />
            </button>

            {/* Сброс */}
            {hasFilters && (
                <button className="btn btn-outline-danger" onClick={reset}>
                    <i className="bi bi-x-lg" />
                </button>
            )}
        </div>
    );
};