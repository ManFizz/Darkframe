import {useCallback, useState} from 'react';

export function useSelection(items) {
    const [selected, setSelected] = useState(new Set());

    const toggle = useCallback((id, e) => {
        if (e?.shiftKey && selected.size > 0) {
            e.preventDefault();
            const ids = items.map(f => f.uniqueId);
            const lastSelected = [...selected][selected.size - 1];
            const from = ids.indexOf(lastSelected);
            const to = ids.indexOf(id);

            const range = ids.slice(
                Math.min(from, to),
                Math.max(from, to) + 1
            );

            setSelected(prev => new Set([...prev, ...range]));
        } else if (e?.ctrlKey || e?.metaKey) {
            setSelected(prev => {
                const next = new Set(prev);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
            });
        } else {
            setSelected(new Set([id]));
        }
    }, [items, selected]);

    const selectAll = useCallback(() => {
        setSelected(new Set(items.map(f => f.uniqueId)));
    }, [items]);

    const clear = useCallback(() => setSelected(new Set()), []);

    const isSelected = useCallback((id) => selected.has(id), [selected]);

    const selectedItems = items?.filter(f => selected.has(f.uniqueId)) || [];

    return { selected, selectedItems, toggle, selectAll, clear, isSelected };
}

export default useSelection;
