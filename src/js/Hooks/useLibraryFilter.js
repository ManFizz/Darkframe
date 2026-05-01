import {useCallback, useMemo, useState} from 'react';

export const SORT_FIELDS = {
    IMPORTED_AT: 'importedAt',
    TITLE:       'title',
    RATING:      'rating',
    SIZE:        'size',
};

export const SORT_ORDER = {
    ASC:  1,
    DESC: -1,
};

const initialFilters = {
    search:  '',
    tags:    [],
    rating:  0,
    sortBy:  SORT_FIELDS.IMPORTED_AT,
    order:   SORT_ORDER.DESC,
};

export function useLibraryFilter(items) {
    const [filters, setFilters] = useState(initialFilters);

    const update = useCallback((field, value) => {
        setFilters(prev => ({ ...prev, [field]: value }));
    }, []);

    const addTag = useCallback((tag) => {
        const t = tag.trim().toLowerCase();
        if (!t) return;
        setFilters(prev => ({
            ...prev,
            tags: prev.tags.includes(t) ? prev.tags : [...prev.tags, t],
        }));
    }, []);

    const removeTag = useCallback((tag) => {
        setFilters(prev => ({
            ...prev,
            tags: prev.tags.filter(t => t !== tag),
        }));
    }, []);

    const reset = useCallback(() => setFilters(initialFilters), []);

    const filtered = useMemo(() => {
        let result = [...items];

        if (filters.search.trim()) {
            const q = filters.search.toLowerCase();
            result = result.filter(f =>
                f.title?.toLowerCase().includes(q) ||
                f.fileName?.toLowerCase().includes(q)
            );
        }

        if (filters.tags.length > 0) {
            result = result.filter(f =>
                filters.tags.every(tag =>
                    Array.isArray(f.tags) && f.tags.includes(tag)
                )
            );
        }

        if (filters.rating > 0) {
            result = result.filter(f => (f.rating || 0) >= filters.rating);
        }

        result.sort((a, b) => {
            let va = a[filters.sortBy] ?? 0;
            let vb = b[filters.sortBy] ?? 0;

            if (typeof va === 'string') return va.localeCompare(vb) * filters.order;
            return (va - vb) * filters.order;
        });

        return result;
    }, [items, filters]);

    return { filters, filtered, update, addTag, removeTag, reset };
}