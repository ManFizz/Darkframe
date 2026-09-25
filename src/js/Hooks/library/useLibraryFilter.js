import {useCallback, useMemo, useState} from 'react';
import {FILTER_DEFAULTS, normalizeFilter, matchItem} from '@/shared/filterPredicate';

export const SORT_FIELDS = {
    ORDER:       'order',
    IMPORTED_AT: 'importedAt',
    TITLE:       'title',
    RATING:      'rating',
    SIZE:        'size',
};

export const SORT_ORDER = {
    ASC:  1,
    DESC: -1,
};

// Rating filter is a range [min, max] over 0..10, where 0 means "unrated".
// Default 0..10 = "any". Setting max below 10 or min above 0 narrows it; the
// special "unrated only" case is just min=0, max=0.
export const RATING_MIN = 0;
export const RATING_MAX = 10;

// Filter conditions live in shared/filterPredicate (same model as smart collections);
// sorting is a view concern and stays here.
const initialFilters = {
    ...FILTER_DEFAULTS,
    sortBy:    SORT_FIELDS.ORDER,
    order:     SORT_ORDER.ASC,
};

export function useLibraryFilter(items) {
    const [filters, setFilters] = useState(initialFilters);

    const update = useCallback((field, value) => {
        setFilters(prev => ({ ...prev, [field]: value }));
    }, []);

    // Merge several fields at once (quick presets, the advanced filter panel).
    const patch = useCallback((values) => {
        setFilters(prev => ({ ...prev, ...values }));
    }, []);

    const addTag = useCallback((tag) => {
        const raw = tag.trim().toLowerCase();
        if (!raw) return;
        const exclude = raw.startsWith('-') || raw.startsWith('!');
        const name = exclude ? raw.slice(1) : raw;
        if (!name) return;
        setFilters(prev => {
            if (prev.tags.some(t => t.name === name)) return prev;
            return { ...prev, tags: [...prev.tags, { name, exclude }] };
        });
    }, []);

    const removeTag = useCallback((name) => {
        setFilters(prev => ({
            ...prev,
            tags: prev.tags.filter(t => t.name !== name),
        }));
    }, []);

    const toggleTagExclude = useCallback((name) => {
        setFilters(prev => ({
            ...prev,
            tags: prev.tags.map(t => t.name === name ? { ...t, exclude: !t.exclude } : t),
        }));
    }, []);

    // Clears every condition but keeps the chosen sorting.
    const reset = useCallback(() => {
        setFilters(prev => ({ ...initialFilters, sortBy: prev.sortBy, order: prev.order }));
    }, []);

    const filtered = useMemo(() => {
        const f = normalizeFilter(filters);
        const now = Math.floor(Date.now() / 1000);
        const result = items.filter(item => matchItem(item, f, now));

        result.sort((a, b) => {
            let va = a[filters.sortBy] ?? 0;
            let vb = b[filters.sortBy] ?? 0;

            if (typeof va === 'string') return va.localeCompare(vb) * filters.order;
            return (va - vb) * filters.order;
        });

        return result;
    }, [items, filters]);

    return { filters, filtered, update, patch, addTag, removeTag, toggleTagExclude, reset };
}
