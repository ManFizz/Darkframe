import {useEffect, useState} from 'react';
import {isWeb} from '@/Infrastructure/electron';

// Phone layout: the app opened in a browser over the network, on a narrow screen.
// (The desktop window keeps its layout at any width.)
const QUERY = '(max-width: 760px)';
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null;

export const isMobileView = () => isWeb && !!mq?.matches;

export function useMobile() {
    const [mobile, setMobile] = useState(isMobileView);
    useEffect(() => {
        if (!isWeb || !mq) return;
        const on = () => setMobile(mq.matches);
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);
    return mobile;
}

/**
 * Horizontal swipe on an element: calls onSwipe(-1) for a swipe to the left,
 * onSwipe(1) to the right. Ignores vertical scrolls, pinches and short moves.
 * Returns touch handlers to spread on the element.
 */
export function swipeHandlers(onSwipe, { min = 60, enabled = true } = {}) {
    let start = null;
    return {
        onTouchStart: (e) => {
            if (!enabled || e.touches.length !== 1) { start = null; return; }
            const t = e.touches[0];
            start = { x: t.clientX, y: t.clientY, at: Date.now() };
        },
        onTouchMove: (e) => { if (e.touches.length > 1) start = null; },
        onTouchEnd: (e) => {
            if (!start) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - start.x, dy = t.clientY - start.y;
            const quick = Date.now() - start.at < 700;
            start = null;
            if (quick && Math.abs(dx) >= min && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? -1 : 1);
        },
    };
}
