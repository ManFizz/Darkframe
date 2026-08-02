import {useCallback, useMemo, useState} from 'react';

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

const initialFilters = {
    search:    '',
    tags:      [],
    ratingMin: RATING_MIN,
    ratingMax: RATING_MAX,
    sortBy:    SORT_FIELDS.ORDER,
    order:     SORT_ORDER.ASC,
};

export function useLibraryFilter(items) {
    const [filters, setFilters] = useState(initialFilters);

    const update = useCallback((field, value) => {
        setFilters(prev => ({ ...prev, [field]: value }));
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
            const includeTags = filters.tags.filter(t => !t.exclude).map(t => t.name);
            const excludeTags = filters.tags.filter(t => t.exclude).map(t => t.name);
            result = result.filter(f => {
                const itemTags = Array.isArray(f.tags) ? f.tags : [];
                return includeTags.every(tag => itemTags.includes(tag))
                    && excludeTags.every(tag => !itemTags.includes(tag));
            });
        }

        const { ratingMin = RATING_MIN, ratingMax = RATING_MAX } = filters;
        if (ratingMin > RATING_MIN || ratingMax < RATING_MAX) {
            result = result.filter(f => {
                const r = f.rating || 0;
                return r >= ratingMin && r <= ratingMax;
            });
        }

        result.sort((a, b) => {
            let va = a[filters.sortBy] ?? 0;
            let vb = b[filters.sortBy] ?? 0;

            if (typeof va === 'string') return va.localeCompare(vb) * filters.order;
            return (va - vb) * filters.order;
        });

        return result;
    }, [items, filters]);

    return { filters, filtered, update, addTag, removeTag, toggleTagExclude, reset };
}
