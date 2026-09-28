import React, {useCallback, useEffect, useRef, useState} from 'react';

const DELAY = 500;   // ms of hovering before playback — skimming the grid stays calm

const isLocal = (src) => /^(library|file):/i.test(String(src || ''));

/**
 * Silent preview of a video while the tile is hovered (library + folder files only;
 * remote videos would have to stream). Returns mouse handlers for the tile and the
 * overlay element to render inside it (absolutely positioned, covers the thumbnail).
 */
export function useHoverVideo(src) {
    const [active, setActive] = useState(false);
    const [ready, setReady] = useState(false);
    const timer = useRef(null);
    const enabled = isLocal(src);

    const onMouseEnter = useCallback(() => {
        if (!enabled) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setActive(true), DELAY);
    }, [enabled]);

    const onMouseLeave = useCallback(() => {
        clearTimeout(timer.current);
        setActive(false);
        setReady(false);
    }, []);

    useEffect(() => () => clearTimeout(timer.current), []);

    const overlay = active ? (
        <video
            className={`hover-video ${ready ? 'ready' : ''}`}
            src={src}
            muted
            loop
            autoPlay
            playsInline
            preload="auto"
            onLoadedMetadata={e => {
                const v = e.currentTarget;
                if (v.duration > 4) v.currentTime = v.duration * 0.1;   // skip intros / black frames
            }}
            onPlaying={() => setReady(true)}
        />
    ) : null;

    return { onMouseEnter, onMouseLeave, overlay };
}

export default useHoverVideo;
