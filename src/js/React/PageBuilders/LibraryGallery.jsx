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

// Full-row header between rating groups: label, rule and count on one line.
// Clicking it folds / unfolds the group.
const RatingDivider = ({ rating, count, collapsed, onToggle }) => (
    <div
        className={`gallery-divider ${rating ? '' : 'unrated'} ${collapsed ? 'collapsed' : ''}`}
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
        <span className="gallery-divider-label">
            {rating
                ? <><i className="bi bi-star-fill" />{rating}<small>/ 10</small></>
                : <><i className="bi bi-star" />Без оценки</>}
        </span>
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

const LibraryGallery = ({ items, onReordered, isSelected, selectedIds, selectionActive, modalUpdater, onToggleSelect, typeView = 2, onFileOpen, scrollRef, resetKey, reorderable = true, groupByRating = false }) => {
    const { isDragging, overId, onDragStart, onDragOver, onDrop, onDragEnd } =
        useItemReorder(items, onReordered, selectedIds);

    const [visibleCount, setVisibleCount] = useState(INITIAL);

    // Group sizes come from the whole list, not just the rendered window.
    const ratingCounts = useMemo(() => {
        if (!groupByRating) return null;
        const counts = new Map();
        for (const f of items) {
            if (isCollection(f)) continue;
            const r = f.rating || 0;
            counts.set(r, (counts.get(r) || 0) + 1);
        }
        return counts;
    }, [items, groupByRating]);
    const sentinelRef = useRef(null);

    // Folded rating groups, remembered across collections and restarts.
    const [collapsedList, setCollapsedList] = useViewPref('collapsedRatings');
    const collapsed = useMemo(() => new Set(collapsedList || []), [collapsedList]);
    const toggleGroup = (r) => setCollapsedList(
        collapsed.has(r) ? [...collapsed].filter(x => x !== r) : [...collapsed, r]
    );

    // What actually renders: dividers interleaved with items, folded groups keeping
    // only their header. Sub-collections aren't rated — they neither get nor break a group.
    const entries = useMemo(() => {
        if (!ratingCounts) return items.map(file => ({ file }));
        const out = [];
        const runs = new Map();   // keys stay unique even if a rating repeats (one render
        let prev = null;          // can still show the previous, unsorted order)
        for (const file of items) {
            if (isCollection(file)) { out.push({ file }); continue; }
            const r = file.rating || 0;
            if (r !== prev) {
                const n = runs.get(r) || 0;
                runs.set(r, n + 1);
                out.push({ divider: r, key: n ? `rating-${r}-${n}` : `rating-${r}` });
                prev = r;
            }
            if (!collapsed.has(r)) out.push({ file });
        }
        return out;
    }, [items, ratingCounts, collapsed]);

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
                    <RatingDivider
                        key={key}
                        rating={divider}
                        count={ratingCounts.get(divider) || 0}
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
