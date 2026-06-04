import {useEffect, useRef} from 'react';

/**
 * Auto-scroll a container while HTML5 drag-and-drop is active.
 * The browser doesn't auto-scroll containers during drag — this hook does.
 *
 * Listens to document-level `dragover` events. When the cursor is inside the
 * container's edge zone, scrolls smoothly via requestAnimationFrame.
 *
 * @param {React.RefObject<HTMLElement>} ref - the scrollable container
 * @param {object} [opts]
 * @param {number} [opts.edge=80]     - px distance from edge that triggers scroll
 * @param {number} [opts.maxSpeed=20] - max px per frame
 */
export function useDragAutoScroll(ref, { edge = 80, maxSpeed = 20 } = {}) {
    const velocityRef = useRef(0);
    const rafRef      = useRef(null);

    useEffect(() => {
        const tick = () => {
            const el = ref.current;
            const v  = velocityRef.current;
            if (el && v !== 0) {
                el.scrollTop += v;
            }
            rafRef.current = v !== 0 ? requestAnimationFrame(tick) : null;
        };

        const start = () => {
            if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
        };

        const stop = () => {
            velocityRef.current = 0;
            if (rafRef.current != null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };

        const onDragOver = (e) => {
            const el = ref.current;
            if (!el) return;

            const rect = el.getBoundingClientRect();
            const y    = e.clientY;

            // Cursor outside container vertically — no scroll
            if (y < rect.top || y > rect.bottom ||
                e.clientX < rect.left || e.clientX > rect.right) {
                velocityRef.current = 0;
                return;
            }

            const distTop    = y - rect.top;
            const distBottom = rect.bottom - y;

            let v = 0;
            if (distTop < edge) {
                // Accelerate as cursor approaches the top edge
                v = -maxSpeed * (1 - distTop / edge);
            } else if (distBottom < edge) {
                v = maxSpeed * (1 - distBottom / edge);
            }

            velocityRef.current = v;
            if (v !== 0) start();
        };

        document.addEventListener('dragover', onDragOver);
        document.addEventListener('drop',    stop);
        document.addEventListener('dragend', stop);

        return () => {
            document.removeEventListener('dragover', onDragOver);
            document.removeEventListener('drop',     stop);
            document.removeEventListener('dragend',  stop);
            stop();
        };
    }, [ref, edge, maxSpeed]);
}
