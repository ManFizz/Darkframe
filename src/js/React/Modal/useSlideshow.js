import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {FILE_TYPES} from '@/Constants';

const KEY = 'jsg_slideshow';
export const SLIDESHOW_INTERVALS = [3, 5, 10];
const DEFAULTS = { interval: 5, shuffle: false, loop: true };

function loadSettings() {
    try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
    catch { return DEFAULTS; }
}

function shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Slideshow over the modal's list. Images advance after `interval` seconds; videos
 * play to the end and then advance (the caller wires onVideoEnded). With shuffle the
 * order is a fresh permutation (current item first); with loop it starts over at the
 * end (re-shuffled), otherwise it stops.
 */
export function useSlideshow({ file, mainArray, modalUpdater }) {
    const [active, setActive]   = useState(false);
    const [paused, setPaused]   = useState(false);
    const [settings, setSettingsState] = useState(loadSettings);
    const orderRef = useRef([]);   // uniqueIds in play order

    const displayable = useMemo(
        () => mainArray.filter(f => f.type === FILE_TYPES.IMAGE || f.type === FILE_TYPES.VIDEO),
        [mainArray],
    );

    const buildOrder = useCallback((shuffle, currentId) => {
        const ids = displayable.map(f => f.uniqueId);
        if (!shuffle) return ids;
        const rest = shuffled(ids.filter(id => id !== currentId));
        return currentId ? [currentId, ...rest] : rest;
    }, [displayable]);

    const setSettings = useCallback((patch) => {
        setSettingsState(prev => {
            const next = { ...prev, ...patch };
            try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
    }, []);

    // Toggling shuffle mid-show re-plans from the current item.
    useEffect(() => {
        if (active) orderRef.current = buildOrder(settings.shuffle, file?.uniqueId);
    }, [active, settings.shuffle]);   // eslint-disable-line react-hooks/exhaustive-deps

    const go = useCallback((dir) => {
        if (!orderRef.current.length) orderRef.current = buildOrder(settings.shuffle, file?.uniqueId);
        let order = orderRef.current;
        const idx = order.indexOf(file?.uniqueId);
        let n = idx + dir;

        if (n >= order.length) {
            if (!settings.loop) { setActive(false); return; }
            if (settings.shuffle) { order = orderRef.current = buildOrder(true, null); }
            n = 0;
        }
        if (n < 0) n = settings.loop ? order.length - 1 : 0;

        const target = displayable.find(f => f.uniqueId === order[n]);
        if (target) modalUpdater(target);
    }, [file, settings, displayable, buildOrder, modalUpdater]);

    const start = useCallback(() => {
        if (!displayable.length) return;
        orderRef.current = buildOrder(settings.shuffle, file?.uniqueId);
        setPaused(false);
        setActive(true);
    }, [displayable, buildOrder, settings.shuffle, file]);

    const stop        = useCallback(() => { setActive(false); setPaused(false); }, []);
    const pause       = useCallback(() => setPaused(true), []);
    const togglePause = useCallback(() => setPaused(p => !p), []);

    // Closing the modal ends the show.
    useEffect(() => { if (!file) stop(); }, [file, stop]);

    // Image slides advance on a timer; videos wait for 'ended'.
    useEffect(() => {
        if (!active || paused || !file || file.type !== FILE_TYPES.IMAGE) return;
        const t = setTimeout(() => go(1), Math.max(1, Number(settings.interval) || 5) * 1000);
        return () => clearTimeout(t);
    }, [active, paused, file?.uniqueId, settings.interval, go]);   // eslint-disable-line react-hooks/exhaustive-deps

    // A clip that finishes while paused advances as soon as the show resumes.
    const endedWhilePaused = useRef(false);
    const onVideoEnded = useCallback(() => {
        if (!active) return;
        if (paused) endedWhilePaused.current = true;
        else go(1);
    }, [active, paused, go]);

    useEffect(() => {
        if (active && !paused && endedWhilePaused.current) {
            endedWhilePaused.current = false;
            go(1);
        }
    }, [active, paused]);   // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { endedWhilePaused.current = false; }, [file?.uniqueId]);

    const position = displayable.findIndex(f => f.uniqueId === file?.uniqueId) + 1;

    return {
        active, paused, settings, setSettings,
        start, stop, pause, togglePause,
        next: () => go(1), prev: () => go(-1),
        onVideoEnded,
        position, total: displayable.length,
    };
}

export default useSlideshow;
