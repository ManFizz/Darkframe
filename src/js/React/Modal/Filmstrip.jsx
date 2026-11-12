import React, {useEffect, useMemo, useRef, useState} from 'react';
import {FILE_TYPES} from '@/Constants';
import {cachedMediaUrl} from '@/Infrastructure/MediaCache';
import {moveItem} from '@/shared/moveItem';

const RADIUS = 40;   // thumbnails rendered on each side of the current one
const EDGE = 60;     // px from the strip's edge where dragging scrolls it
const EDGE_STEP = 24;   // px per dragover (they fire every ~50 ms)

// Thumbnail strip along the bottom of the viewer: neighbours of the current file,
// click to jump. Only a window around the current item is rendered, so it stays
// cheap in collections of thousands. With `onReorder` thumbnails can be dragged left
// and right; it receives the whole list in its new order.
const Filmstrip = ({ items, current, onPick, onHide, onReorder }) => {
    const media = useMemo(
        () => items.filter(f => f.type === FILE_TYPES.IMAGE || f.type === FILE_TYPES.VIDEO),
        [items]);
    const index = media.findIndex(f => f.uniqueId === current?.uniqueId);
    const from = Math.max(0, index - RADIUS);
    const shown = media.slice(from, index + RADIUS + 1);
    const trackRef = useRef(null);

    // Keep the current thumbnail centred: it glides while paging, but the strip
    // opens already in place.
    const placed = useRef(false);
    useEffect(() => {
        const el = trackRef.current?.querySelector('.fs-item.current');
        el?.scrollIntoView({ behavior: placed.current ? 'smooth' : 'instant', block: 'nearest', inline: 'center' });
        if (el) placed.current = true;
    }, [current?.uniqueId, index]);

    const [dragId, setDragId] = useState(null);
    const [over, setOver] = useState(null);   // { id, after }: where the drop would land

    const endDrag = () => { setDragId(null); setOver(null); };

    const onDragOver = (e) => {
        if (!dragId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const track = trackRef.current;
        const { left, right } = track.getBoundingClientRect();
        if (e.clientX - left < EDGE) track.scrollLeft -= EDGE_STEP;
        else if (right - e.clientX < EDGE) track.scrollLeft += EDGE_STEP;

        const el = e.target.closest?.('.fs-item');
        if (!el) return;   // in a gap: the last target stands
        const box = el.getBoundingClientRect();
        const next = { id: el.dataset.id, after: e.clientX > box.left + box.width / 2 };
        if (next.id !== over?.id || next.after !== over?.after) setOver(next);
    };

    const onDrop = (e) => {
        if (!dragId) return;
        e.preventDefault();
        if (over) {
            const moved = moveItem(items, dragId, over.id, over.after);
            if (moved !== items) onReorder(moved);
        }
        endDrag();
    };

    if (index < 0 || media.length < 2) return null;

    const srcOf = (f) => cachedMediaUrl(f.previewUrl && f.previewUrl !== f.contentUrl ? f.previewUrl : f.thumbUrl);

    return (
        <div className="filmstrip" onWheel={e => {
            // vertical wheel scrolls the strip sideways
            if (trackRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) trackRef.current.scrollLeft += e.deltaY;
        }}>
            {onHide && (
                <button className="fs-hide" onClick={onHide} title="Спрятать ленту (T)">
                    <i aria-hidden="true" className="bi bi-chevron-down" />
                </button>
            )}
            <div className="fs-track" ref={trackRef} onDragOver={onDragOver} onDrop={onDrop}>
                {from > 0 && <div className="fs-more">+{from}</div>}
                {shown.map(f => (
                    <button key={f.uniqueId}
                            data-id={f.uniqueId}
                            className={`fs-item ${f.uniqueId === current.uniqueId ? 'current' : ''} ${f.uniqueId === dragId ? 'dragging' : ''} ${dragId && dragId !== f.uniqueId && over?.id === f.uniqueId ? (over.after ? 'drop-after' : 'drop-before') : ''}`}
                            onClick={() => onPick(f)}
                            draggable={!!onReorder}
                            onDragStart={onReorder ? (e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('df/strip-item', f.uniqueId);
                                setDragId(f.uniqueId);
                            } : undefined}
                            onDragEnd={endDrag}
                            title={f.title}>
                        {f.type === FILE_TYPES.VIDEO && !f.thumbUrl?.startsWith('library://') && f.thumbUrl === f.contentUrl
                            ? <span className="fs-video-ph"><i aria-hidden="true" className="bi bi-film" /></span>
                            : <img src={srcOf(f)} alt="" loading="lazy" draggable={false} />}
                        {f.type === FILE_TYPES.VIDEO && <span className="fs-play"><i aria-hidden="true" className="bi bi-play-fill" /></span>}
                    </button>
                ))}
                {index + RADIUS + 1 < media.length && <div className="fs-more">+{media.length - index - RADIUS - 1}</div>}
            </div>
        </div>
    );
};

export default React.memo(Filmstrip);
