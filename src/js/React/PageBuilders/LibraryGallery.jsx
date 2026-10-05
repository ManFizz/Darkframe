import React, {useEffect, useMemo, useRef, useState} from 'react';
import Thumb from '../Thumb/Thumb';
import {useItemReorder} from '@hooks/library/useItemReorder';
import {FILE_TYPES} from '@/Constants';
import {useViewPref} from '@services/viewPrefs';

const isCollection = (f) => f.type === FILE_TYPES.COLLECTION;

const plural = (n) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'файл';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'файла';
    return 'файлов';
};

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const monthKey = (t) => {
    if (!t) return 'none';
    const d = new Date(t * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const NO_DATE = { importedAt: 'Без даты', lastViewedAt: 'Ещё не открывались', editedAt: 'Без правок' };
const KINDS = [
    { label: 'Изображения', icon: 'bi-image' },
    { label: 'GIF', icon: 'bi-filetype-gif' },
    { label: 'Видео', icon: 'bi-film' },
    { label: 'Манга', icon: 'bi-book' },
];
const kindOf = (f) => (f.isManga ? 3 : String(f.mimeType || '').startsWith('video/') ? 2 : f.mimeType === 'image/gif' ? 1 : 0);

// How the gallery is split into groups: by rating, by the month of a date field
// ("month:importedAt", "month:lastViewedAt"…) or by file type. `key` must be
// stable and serialisable (folded groups are remembered in the view prefs).
const GROUPINGS = {
    rating: {
        key: (f) => f.rating || 0,
        collapsedPref: 'collapsedRatings',
        muted: (k) => !k,
        label: (k) => (k
            ? <><i className="bi bi-star-fill" />{k}<small>/ 10</small></>
            : <><i className="bi bi-star" />Без оценки</>),
    },
    type: {
        key: kindOf,
        collapsedPref: 'collapsedTypes',
        muted: () => false,
        label: (k) => <><i className={`bi ${KINDS[k].icon}`} />{KINDS[k].label}</>,
    },
};

function groupingFor(groupBy) {
    if (!groupBy) return null;
    if (!groupBy.startsWith('month')) return GROUPINGS[groupBy] || null;
    const field = groupBy.split(':')[1] || 'importedAt';
    return {
        key: (f) => monthKey(f[field] || (field === 'importedAt' ? f.time : 0)),
        collapsedPref: 'collapsedMonths',
        muted: (k) => k === 'none',
        label: (k) => {
            if (k === 'none') return <><i className="bi bi-calendar-x" />{NO_DATE[field] || 'Без даты'}</>;
            const [y, m] = k.split('-').map(Number);
            const thisYear = new Date().getFullYear();
            return <><i className="bi bi-calendar3" />{MONTHS[m - 1]}{y !== thisYear && <small>{y}</small>}</>;
        },
    };
}

// Full-row header between groups: label, rule and count on one line.
// Clicking it folds / unfolds the group.
const GroupDivider = ({ grouping, value, count, collapsed, onToggle }) => (
    <div
        className={`gallery-divider ${grouping.muted(value) ? 'unrated' : ''} ${collapsed ? 'collapsed' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        title={collapsed ? 'Показать группу' : 'Скрыть группу'}
        onClick={onToggle}
        onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggle(); }
        }}
    >
        <i className="bi bi-chevron-down gallery-divider-caret" />
        <span className="gallery-divider-label">{grouping.label(value)}</span>
        <span className="gallery-divider-line" />
        <span className="gallery-divider-count">
            {collapsed && <span className="gallery-divider-hidden">скрыто · </span>}
            {count} {plural(count)}
        </span>
    </div>
);

// The library can hold thousands of items; rendering them all at once is what made
// big collections crawl. We render a growing window instead — the first chunk, then
// more as the sentinel scrolls into view. The full `items` array still drives reorder
// (below), so drag-and-drop keeps working across the whole list.
const INITIAL = 150;
const CHUNK   = 150;

const LibraryGallery = ({ items, onReordered, isSelected, selectedIds, selectionActive, modalUpdater, onToggleSelect, typeView = 2, onFileOpen, scrollRef, resetKey, reorderable = true, groupBy = null }) => {
    const grouping = useMemo(() => groupingFor(groupBy), [groupBy]);
    const { isDragging, overId, onDragStart, onDragOver, onDrop, onDragEnd } =
        useItemReorder(items, onReordered, selectedIds);

    const [visibleCount, setVisibleCount] = useState(INITIAL);

    // Group sizes come from the whole list, not just the rendered window.
    const groupCounts = useMemo(() => {
        if (!grouping) return null;
        const counts = new Map();
        for (const f of items) {
            if (isCollection(f)) continue;
            const k = grouping.key(f);
            counts.set(k, (counts.get(k) || 0) + 1);
        }
        return counts;
    }, [items, grouping]);
    const sentinelRef = useRef(null);

    // Folded groups, remembered across collections and restarts.
    const [collapsedList, setCollapsedList] = useViewPref(grouping?.collapsedPref || 'collapsedRatings');
    const collapsed = useMemo(() => new Set(collapsedList || []), [collapsedList]);
    const toggleGroup = (r) => setCollapsedList(
        collapsed.has(r) ? [...collapsed].filter(x => x !== r) : [...collapsed, r]
    );

    // What actually renders: dividers interleaved with items, folded groups keeping
    // only their header. Sub-collections neither get nor break a group.
    const entries = useMemo(() => {
        if (!groupCounts) return items.map(file => ({ file }));
        const out = [];
        const runs = new Map();   // keys stay unique even if a rating repeats (one render
        let prev = null;          // can still show the previous, unsorted order)
        for (const file of items) {
            if (isCollection(file)) { out.push({ file }); continue; }
            const r = grouping.key(file);
            if (r !== prev) {
                const n = runs.get(r) || 0;
                runs.set(r, n + 1);
                out.push({ divider: r, key: n ? `group-${r}-${n}` : `group-${r}` });
                prev = r;
            }
            if (!collapsed.has(r)) out.push({ file });
        }
        return out;
    }, [items, groupCounts, grouping, collapsed]);

    // Start over only when the dataset genuinely changes (collection / filter switch),
    // not on in-place reorders or patches that merely replace the array identity.
    useEffect(() => { setVisibleCount(INITIAL); }, [resetKey]);

    // Grow the window when the sentinel nears the bottom of the scroll container.
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || visibleCount >= entries.length) return;

        const observer = new IntersectionObserver(
            ([hit]) => {
                if (hit.isIntersecting) {
                    setVisibleCount(c => Math.min(c + CHUNK, entries.length));
                }
            },
            { root: scrollRef?.current || null, rootMargin: '600px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [visibleCount, entries.length, scrollRef]);

    return (
        <div className={`gallery-view-${typeView}`}>
            {entries.slice(0, visibleCount).map(({ file, divider, key }) => {
                if (file === undefined) return (
                    <GroupDivider
                        key={key}
                        grouping={grouping}
                        value={divider}
                        count={groupCounts.get(divider) || 0}
                        collapsed={collapsed.has(divider)}
                        onToggle={() => toggleGroup(divider)}
                    />
                );
                return (
                <div
                    key={file.uniqueId}
                    className={`
                        thumb-drag-wrapper
                        ${isDragging(file.uniqueId) ? 'dragging' : ''}
                        ${overId === file.uniqueId ? 'drag-over' : ''}
                    `}
                    draggable={reorderable}
                    onDragStart={reorderable ? (e => {
                        const isMulti = selectedIds?.has(file.uniqueId) && selectedIds.size > 1;
                        if (isMulti) {
                            const draggedFileIds = items
                                .filter(f => selectedIds.has(f.uniqueId))
                                .map(f => f.id);
                            e.dataTransfer.setData('jsg/fileIds', JSON.stringify(draggedFileIds));
                        }
                        e.dataTransfer.setData('jsg/fileId', file.id);
                        e.dataTransfer.setData('jsg/reorder', 'true');
                        onDragStart(e, file.uniqueId);
                    }) : undefined}
                    onDragOver={reorderable ? (e => onDragOver(e, file.uniqueId)) : undefined}
                    onDrop={reorderable ? (e => onDrop(e, file.uniqueId)) : undefined}
                    onDragEnd={reorderable ? onDragEnd : undefined}
                >
                    <Thumb
                        file={file}
                        modalUpdater={modalUpdater}
                        isModal={false}
                        isSelected={isSelected?.(file.uniqueId)}
                        selectionActive={selectionActive}
                        onToggleSelect={onToggleSelect}
                        onOpen={onFileOpen}
                    />
                </div>
                );
            })}
            {/* Full-row sentinel: when it scrolls into view, render the next chunk. */}
            <div ref={sentinelRef} style={{ flexBasis: '100%', width: '100%', height: 1 }} aria-hidden="true" />
        </div>
    );
};

export default LibraryGallery;
