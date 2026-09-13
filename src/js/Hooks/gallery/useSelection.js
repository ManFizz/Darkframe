import {useCallback, useMemo, useRef, useState} from 'react';

// Explorer-style selection over the *displayed* order of `items`:
//   • plain click      → select only that item (becomes the anchor)
//   • ctrl/cmd click    → toggle that item (becomes the anchor)
//   • shift click       → select the range anchor…item, unioned with the pre-shift base
//   • checkbox click    → toggle (see `toggle`), shift+checkbox → range
// The anchor and the "base" (selection at the last non-shift action) are kept in refs
// so repeated shift-clicks keep extending from the same anchor instead of drifting.
export function useSelection(items) {
    const [selected, setSelected] = useState(() => new Set());
    const anchorRef = useRef(null);
    const baseRef   = useRef(new Set());

    const ids = useMemo(() => items.map(f => f.uniqueId), [items]);

    const selectOnly = useCallback((id) => {
        anchorRef.current = id;
        baseRef.current = new Set([id]);
        setSelected(new Set([id]));
    }, []);

    const toggle = useCallback((id) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            anchorRef.current = id;
            baseRef.current = new Set(next);
            return next;
        });
    }, []);

    const range = useCallback((id) => {
        const anchor = anchorRef.current;
        const from = ids.indexOf(anchor);
        const to   = ids.indexOf(id);
        if (anchor == null || from === -1 || to === -1) { selectOnly(id); return; }
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        setSelected(new Set([...baseRef.current, ...ids.slice(lo, hi + 1)]));
    }, [ids, selectOnly]);

    // One entry point that reads the modifier keys off the click event.
    const handleSelect = useCallback((id, e = {}) => {
        if (e.shiftKey) range(id);
        else if (e.ctrlKey || e.metaKey) toggle(id);
        else selectOnly(id);
    }, [range, toggle, selectOnly]);

    const selectAll = useCallback(() => {
        baseRef.current = new Set(ids);
        setSelected(new Set(ids));
    }, [ids]);

    const invert = useCallback(() => {
        setSelected(prev => {
            const next = new Set(ids.filter(id => !prev.has(id)));
            baseRef.current = new Set(next);
            anchorRef.current = null;
            return next;
        });
    }, [ids]);

    const clear = useCallback(() => {
        anchorRef.current = null;
        baseRef.current = new Set();
        setSelected(new Set());
    }, []);

    const isSelected    = useCallback((id) => selected.has(id), [selected]);
    const selectedItems = useMemo(() => items.filter(f => selected.has(f.uniqueId)), [items, selected]);

    return {
        selected, selectedItems, isSelected,
        handleSelect, toggle, selectOnly, range,
        selectAll, invert, clear,
    };
}

export default useSelection;
