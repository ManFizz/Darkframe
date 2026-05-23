import {useCallback, useRef} from 'react';

export function useClickHandler({ onClick, onDoubleClick, delay = 250 }) {
    const timerRef = useRef(null);
    const preventRef = useRef(false);

    return useCallback((e) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
            preventRef.current = true;
            onDoubleClick?.(e);
        } else {
            preventRef.current = false;
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                if (!preventRef.current) onClick?.(e);
            }, delay);
        }
    }, [onClick, onDoubleClick, delay]);
}
