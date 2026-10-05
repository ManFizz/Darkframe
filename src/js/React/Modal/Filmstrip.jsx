import React, {useEffect, useMemo, useRef} from 'react';
import {FILE_TYPES} from '@/Constants';
import {cachedMediaUrl} from '@/Infrastructure/MediaCache';

const RADIUS = 40;   // thumbnails rendered on each side of the current one

// Thumbnail strip along the bottom of the viewer: neighbours of the current file,
// click to jump. Only a window around the current item is rendered, so it stays
// cheap in collections of thousands.
const Filmstrip = ({ items, current, onPick, onHide }) => {
    const media = useMemo(
        () => items.filter(f => f.type === FILE_TYPES.IMAGE || f.type === FILE_TYPES.VIDEO),
        [items]);
    const index = media.findIndex(f => f.uniqueId === current?.uniqueId);
    const from = Math.max(0, index - RADIUS);
    const shown = media.slice(from, index + RADIUS + 1);
    const trackRef = useRef(null);

    // Keep the current thumbnail centred.
    useEffect(() => {
        const el = trackRef.current?.querySelector('.fs-item.current');
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [current?.uniqueId]);

    if (index < 0 || media.length < 2) return null;

    const srcOf = (f) => cachedMediaUrl(f.previewUrl && f.previewUrl !== f.contentUrl ? f.previewUrl : f.thumbUrl);

    return (
        <div className="filmstrip" onWheel={e => {
            // vertical wheel scrolls the strip sideways
            if (trackRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) trackRef.current.scrollLeft += e.deltaY;
        }}>
            {onHide && (
                <button className="fs-hide" onClick={onHide} title="Спрятать ленту (T)">
                    <i className="bi bi-chevron-down" />
                </button>
            )}
            <div className="fs-track" ref={trackRef}>
                {from > 0 && <div className="fs-more">+{from}</div>}
                {shown.map(f => (
                    <button key={f.uniqueId}
                            className={`fs-item ${f.uniqueId === current.uniqueId ? 'current' : ''}`}
                            onClick={() => onPick(f)}
                            title={f.title}>
                        {f.type === FILE_TYPES.VIDEO && !f.thumbUrl?.startsWith('library://') && f.thumbUrl === f.contentUrl
                            ? <span className="fs-video-ph"><i className="bi bi-film" /></span>
                            : <img src={srcOf(f)} alt="" loading="lazy" draggable={false} />}
                        {f.type === FILE_TYPES.VIDEO && <span className="fs-play"><i className="bi bi-play-fill" /></span>}
                    </button>
                ))}
                {index + RADIUS + 1 < media.length && <div className="fs-more">+{media.length - index - RADIUS - 1}</div>}
            </div>
        </div>
    );
};

export default React.memo(Filmstrip);
