import React, {useCallback, useEffect, useRef, useState} from 'react';
import {getStoryboard} from '@/Infrastructure/Ipc';
import {toggleViewerFullscreen} from './fullscreen';
import {matches} from '@services/keymap';

const RATE_KEY      = 'jsg_video_rate';
const VOL_KEY       = 'jsg_video_volume';
const COLLAPSED_KEY = 'jsg_video_controls_collapsed';
const SPEEDS        = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const FRAME         = 1 / 30;   // no true fps from <video>, ~30fps is a fine step
const IDLE_MS       = 2600;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

const formatTime = (t) => {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const s = String(Math.floor(t % 60)).padStart(2, '0');
    return `${m}:${s}`;
};

const PLAY_MODE_META = {
    repeat:  { icon: 'bi-repeat-1',        title: 'Повтор одного' },
    next:    { icon: 'bi-collection-play',  title: 'Играть дальше по списку' },
    shuffle: { icon: 'bi-shuffle',          title: 'Вперемешку' },
};

const volumeIcon = (muted, v) =>
    muted || v === 0 ? 'bi-volume-mute-fill'
        : v < 0.5     ? 'bi-volume-down-fill'
        :               'bi-volume-up-fill';

// Progress pill shown while a file edit (trim / revert) runs in the main process.
const BusyIndicator = ({ busy }) => (
    <div className="vc-busy">
        <div className="vc-busy-label">
            <i className="bi bi-arrow-repeat spin" />
            {busy.label}{busy.percent != null ? ` ${Math.round(busy.percent)}%` : '…'}
        </div>
        <div className="vc-busy-bar">
            <div style={{ width: `${busy.percent ?? 0}%` }} />
        </div>
    </div>
);

// tools — actions from <Video>: captureFrame (any source) plus, for editable library
//         videos, { setThumb, trim, revert, canRevert }
// busy  — { label, percent } while such an edit is running
// resume — { position } when a saved spot can be continued (onResume / onDismissResume)
const VideoControls = ({
    video, isPaused, currentTime, videoDuration, playMode, cyclePlayMode,
    tools, busy, resume, onResume, onDismissResume, storyboardSrc,
}) => {
    const [volume, setVolume]     = useState(1);
    const [muted, setMuted]       = useState(false);
    const [rate, setRate]         = useState(1);
    const [buffered, setBuffered] = useState(0);
    const [startRec, setStartRec] = useState(null);   // A of the A–B loop
    const [endRec, setEndRec]     = useState(null);   // B of the A–B loop
    const [speedOpen, setSpeedOpen] = useState(false);
    const [hoverPct, setHoverPct] = useState(null);   // seek-bar hover position
    // Frame previews over the seek bar: the storyboard sprite is fetched on first hover.
    const [board, setBoard] = useState(null);         // null | 'loading' | 'none' | { url, cols, … }
    const sbKey = storyboardSrc ? JSON.stringify(storyboardSrc) : null;
    useEffect(() => { setBoard(null); }, [sbKey]);
    useEffect(() => {
        if (hoverPct === null || board !== null || !storyboardSrc) return;
        setBoard('loading');
        getStoryboard(storyboardSrc).then(sb => setBoard(sb || 'none')).catch(() => setBoard('none'));
    }, [hoverPct, board, sbKey]);   // eslint-disable-line react-hooks/exhaustive-deps
    const [hidden, setHidden]     = useState(false);   // auto-hide while playing
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1');
    const [toolsOpen, setToolsOpen] = useState(false);
    const [trimOpen, setTrimOpen]   = useState(false);
    const [trimMode, setTrimMode]   = useState('precise');
    const [trimBackup, setTrimBackup] = useState(true);

    const isSpaceDown = useRef(false);
    const wasPlaying  = useRef(false);
    const trackRef    = useRef(null);
    const speedRef    = useRef(null);
    const toolsRef    = useRef(null);
    const fillRef     = useRef(null);
    const thumbRef    = useRef(null);

    const dur = videoDuration || 0;
    const pct = (t) => (dur ? clamp(t / dur, 0, 1) * 100 : 0);
    const abActive = startRec !== null && endRec !== null;

    useEffect(() => {
        if (!video) return;

        const savedRate = parseFloat(localStorage.getItem(RATE_KEY));
        const savedVol  = parseFloat(localStorage.getItem(VOL_KEY));
        if (isFinite(savedRate)) video.playbackRate = savedRate;
        if (isFinite(savedVol))  video.volume = savedVol;

        const sync = () => { setVolume(video.volume); setMuted(video.muted); setRate(video.playbackRate); };
        const syncBuffered = () => {
            try {
                const b = video.buffered;
                if (b.length) setBuffered(b.end(b.length - 1) / (video.duration || 1));
            } catch { /* buffered can throw before metadata */ }
        };

        sync(); syncBuffered();
        video.addEventListener('volumechange', sync);
        video.addEventListener('ratechange', sync);
        video.addEventListener('progress', syncBuffered);
        video.addEventListener('timeupdate', syncBuffered);
        return () => {
            video.removeEventListener('volumechange', sync);
            video.removeEventListener('ratechange', sync);
            video.removeEventListener('progress', syncBuffered);
            video.removeEventListener('timeupdate', syncBuffered);
        };
    }, [video]);

    useEffect(() => {
        if (!video || collapsed) return;
        let raf;
        const tick = () => {
            const d = video.duration || 0;
            const p = d ? clamp(video.currentTime / d, 0, 1) * 100 : 0;
            if (fillRef.current)  fillRef.current.style.width = `${p}%`;
            if (thumbRef.current) thumbRef.current.style.left = `${p}%`;
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [video, collapsed]);

    const togglePlay = useCallback(() => {
        if (video) (video.paused || video.ended) ? video.play().catch(() => {}) : video.pause();
    }, [video]);

    const skipToSec = useCallback((s) => {
        if (video) video.currentTime = clamp(s, 0, video.duration || 0);
    }, [video]);

    const skipSec = useCallback((d) => {
        if (video) video.currentTime = clamp(video.currentTime + d, 0, video.duration || 0);
    }, [video]);

    const stepFrame = useCallback((dir) => {
        if (!video) return;
        video.pause();
        video.currentTime = clamp(video.currentTime + dir * FRAME, 0, video.duration || 0);
    }, [video]);

    const setPlaybackRate = useCallback((r) => {
        r = clamp(r, SPEEDS[0], SPEEDS[SPEEDS.length - 1]);
        if (video) video.playbackRate = r;
        localStorage.setItem(RATE_KEY, String(r));
    }, [video]);

    const bumpRate = useCallback((dir) => {
        const cur = video?.playbackRate ?? 1;
        let i = SPEEDS.findIndex(s => Math.abs(s - cur) < 0.001);
        if (i < 0) i = SPEEDS.indexOf(1);
        setPlaybackRate(SPEEDS[clamp(i + dir, 0, SPEEDS.length - 1)]);
    }, [video, setPlaybackRate]);

    const setVol = useCallback((v) => {
        v = clamp(v, 0, 1);
        if (video) { video.volume = v; if (v > 0) video.muted = false; }
        localStorage.setItem(VOL_KEY, String(v));
    }, [video]);

    const toggleMute = useCallback(() => { if (video) video.muted = !video.muted; }, [video]);

    // Fullscreen the whole viewer so this bar stays visible, not the bare <video>.
    const toggleFullscreen = useCallback(() => toggleViewerFullscreen(), []);

    const togglePip = useCallback(async () => {
        if (!video) return;
        try {
            if (document.pictureInPictureElement) await document.exitPictureInPicture();
            else await video.requestPictureInPicture?.();
        } catch { /* pip unsupported / blocked — ignore */ }
    }, [video]);

    const toggleCollapsed = useCallback(() => {
        setCollapsed(prev => {
            const next = !prev;
            localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
            return next;
        });
    }, []);

    const handleAB = useCallback(() => {
        const t = video?.currentTime ?? 0;
        if (startRec === null)      setStartRec(t);
        else if (endRec === null)   (t <= startRec ? setStartRec(t) : setEndRec(t));
        else                        { setStartRec(null); setEndRec(null); }
    }, [video, startRec, endRec]);

    useEffect(() => {
        if (!video || !abActive) return;
        const onTime = () => { if (video.currentTime > endRec || video.currentTime < startRec) video.currentTime = startRec; };
        video.addEventListener('timeupdate', onTime);
        return () => video.removeEventListener('timeupdate', onTime);
    }, [video, abActive, startRec, endRec]);

    const onSeekDown = useCallback(() => {
        if (!video) return;
        wasPlaying.current = !video.paused;
        video.pause();
    }, [video]);

    const onSeekUp = useCallback(() => {
        if (video && wasPlaying.current) video.play().catch(() => {});
    }, [video]);

    const hideTimerRef = useRef(null);
    const isPausedRef = useRef(isPaused);
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

    // Show the bar and (re)arm the idle timer. Used by both mouse move and keyboard
    // shortcuts, so any interaction — including seeking via keys — surfaces controls.
    const reveal = useCallback(() => {
        setHidden(false);
        clearTimeout(hideTimerRef.current);
        if (!isPausedRef.current) hideTimerRef.current = setTimeout(() => setHidden(true), IDLE_MS);
    }, []);

    useEffect(() => {
        if (collapsed) return;
        reveal();
        document.addEventListener('mousemove', reveal);
        document.addEventListener('pointerdown', reveal);   // taps: no mouse to move
        return () => {
            clearTimeout(hideTimerRef.current);
            document.removeEventListener('mousemove', reveal);
            document.removeEventListener('pointerdown', reveal);
        };
    }, [isPaused, collapsed, reveal]);

    useEffect(() => {
        if (!speedOpen) return;
        const onDown = (e) => { if (speedRef.current && !speedRef.current.contains(e.target)) setSpeedOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [speedOpen]);

    useEffect(() => {
        if (!toolsOpen) return;
        const onDown = (e) => { if (toolsRef.current && !toolsRef.current.contains(e.target)) setToolsOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [toolsOpen]);

    const startTrim = useCallback(() => {
        if (!tools?.trim || !abActive) return;
        setTrimOpen(false);
        tools.trim({ start: startRec, end: endRec, mode: trimMode, backup: trimBackup });
    }, [tools, abActive, startRec, endRec, trimMode, trimBackup]);

    const startRevert = useCallback(() => {
        setToolsOpen(false);
        if (!tools) return;
        if (!confirm('Вернуть исходное видео? Обрезка будет отменена.')) return;
        tools.revert();
    }, [tools]);

    useEffect(() => {
        const typing = () => {
            const el = document.activeElement;
            return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable;
        };
        const onKeyDown = (e) => {
            if (typing()) return;
            reveal();   // any interaction surfaces the controls + resets the idle timer

            // Ctrl+←/→ seeks; plain ←/→ is left to Navigation (prev/next file).
            if (e.ctrlKey || e.metaKey || e.altKey) {
                if (e.key === 'ArrowLeft')  { e.preventDefault(); skipSec(-10); }
                if (e.key === 'ArrowRight') { e.preventDefault(); skipSec(10); }
                return;
            }

            // Remappable ones first (Settings → Hotkeys).
            if (matches(e, 'video.mute'))       { toggleMute(); return; }
            if (matches(e, 'video.fullscreen')) { e.preventDefault(); toggleFullscreen(); return; }
            if (matches(e, 'video.pip'))        { togglePip(); return; }
            if (matches(e, 'video.slower'))     { bumpRate(-1); return; }
            if (matches(e, 'video.faster'))     { bumpRate(1); return; }
            if (matches(e, 'media.frameBack'))  { stepFrame(-1); return; }
            if (matches(e, 'media.frameFwd'))   { stepFrame(1); return; }

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    if (isSpaceDown.current) return;
                    isSpaceDown.current = true;
                    togglePlay();
                    break;
                case 'ArrowUp':   e.preventDefault(); setVol((video?.volume ?? 1) + 0.05); break;
                case 'ArrowDown': e.preventDefault(); setVol((video?.volume ?? 1) - 0.05); break;
                // Digits are reserved for rating in the modal (0 = 10); use Ctrl+←/→ to seek.
            }
        };
        const onKeyUp = (e) => { if (e.code === 'Space') isSpaceDown.current = false; };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
        };
    }, [video, togglePlay, toggleMute, toggleFullscreen, togglePip, setVol, bumpRate, stepFrame, skipSec, reveal]);

    if (collapsed) {
        return (
            <>
                {busy && <div className="vc-busy-float"><BusyIndicator busy={busy} /></div>}
                {resume && !busy && (
                    <div className="vc-busy-float">
                        <div className="vc-resume">
                            <i className="bi bi-clock-history" />
                            <span>Продолжить с <b>{formatTime(resume.position)}</b>?</span>
                            <button className="vc-panel-btn primary" onClick={onResume}>
                                <i className="bi bi-play-fill" /> Продолжить
                            </button>
                            <button className="vc-panel-btn" onClick={onDismissResume}>С начала</button>
                        </div>
                    </div>
                )}
                <button className="vc-expand" title="Показать управление" onClick={toggleCollapsed}>
                    <i className="bi bi-chevron-up" />
                </button>
            </>
        );
    }

    // Keep the bar on screen while a menu/panel is open, an edit runs or a resume
    // offer is waiting for an answer.
    const pinned = toolsOpen || trimOpen || !!busy || !!resume;

    const mode = PLAY_MODE_META[playMode] || PLAY_MODE_META.repeat;
    const abLabel = startRec === null ? 'A‑B' : endRec === null ? 'A →' : 'A‑B';
    const abTitle = startRec === null ? 'Отметить начало повтора (A)'
        : endRec === null ? 'Отметить конец повтора (B)'
        : 'Сбросить A–B повтор';

    return (
        <div className={`video-controls v2 ${hidden && !pinned ? 'idle' : ''}`}>
            {busy && <BusyIndicator busy={busy} />}

            {resume && !busy && (
                <div className="vc-resume">
                    <i className="bi bi-clock-history" />
                    <span>Продолжить с <b>{formatTime(resume.position)}</b>?</span>
                    <button className="vc-panel-btn primary" onClick={onResume}>
                        <i className="bi bi-play-fill" /> Продолжить
                    </button>
                    <button className="vc-panel-btn" onClick={onDismissResume}>С начала</button>
                </div>
            )}

            {trimOpen && tools?.trim && abActive && !busy && (
                <div className="vc-panel">
                    <div className="vc-panel-title">
                        <i className="bi bi-scissors" />
                        Оставить {formatTime(startRec)} – {formatTime(endRec)}
                        <span className="vc-panel-dim">({formatTime(endRec - startRec)})</span>
                    </div>
                    <label className="vc-option">
                        <input type="radio" checked={trimMode === 'precise'} onChange={() => setTrimMode('precise')} />
                        <span><b>Точно</b> — с перекодированием, режет по кадру; дольше</span>
                    </label>
                    <label className="vc-option">
                        <input type="radio" checked={trimMode === 'fast'} onChange={() => setTrimMode('fast')} />
                        <span><b>Быстро</b> — без перекодирования и потерь; начало может сдвинуться к ближайшему ключевому кадру</span>
                    </label>
                    <label className="vc-option">
                        <input type="checkbox" checked={trimBackup} onChange={e => setTrimBackup(e.target.checked)} />
                        <span>Сохранить оригинал, чтобы можно было откатить</span>
                    </label>
                    <div className="vc-panel-actions">
                        <button className="vc-panel-btn" onClick={() => setTrimOpen(false)}>Отмена</button>
                        <button className="vc-panel-btn primary" onClick={startTrim}>
                            <i className="bi bi-scissors" /> Обрезать
                        </button>
                    </div>
                </div>
            )}

            {/* Progress track */}
            <div
                className="vc-track"
                ref={trackRef}
                onMouseMove={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setHoverPct(clamp((e.clientX - r.left) / r.width, 0, 1));
                }}
                onMouseLeave={() => setHoverPct(null)}
            >
                <div className="vc-buffered" style={{ width: `${buffered * 100}%` }} />
                {abActive && (
                    <div className="vc-ab-region" style={{ left: `${pct(startRec)}%`, width: `${pct(endRec) - pct(startRec)}%` }} />
                )}
                <div className="vc-fill" ref={fillRef} style={{ width: `${pct(currentTime)}%` }} />
                {startRec !== null && <div className="vc-mark" style={{ left: `${pct(startRec)}%` }} />}
                {endRec   !== null && <div className="vc-mark" style={{ left: `${pct(endRec)}%` }} />}
                <div className="vc-thumb" ref={thumbRef} style={{ left: `${pct(currentTime)}%` }} />
                {hoverPct !== null && board && typeof board === 'object' && (() => {
                    const i = Math.min(board.count - 1, Math.floor(hoverPct * board.count));
                    const scale = 1.25;   // sprite frames are 160px wide
                    return (
                        <div className="vc-preview" style={{
                            left: `${hoverPct * 100}%`,
                            width: board.width * scale,
                            height: board.height * scale,
                            backgroundImage: `url("${board.url}")`,
                            backgroundSize: `${board.cols * board.width * scale}px ${board.rows * board.height * scale}px`,
                            backgroundPosition: `-${(i % board.cols) * board.width * scale}px -${Math.floor(i / board.cols) * board.height * scale}px`,
                        }} />
                    );
                })()}
                {hoverPct !== null && (
                    <div className="vc-tooltip" style={{ left: `${hoverPct * 100}%` }}>
                        {formatTime(hoverPct * dur)}
                    </div>
                )}
                <input
                    className="vc-seek"
                    type="range"
                    min={0}
                    max={dur || 0}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => skipToSec(Number(e.target.value))}
                    onMouseDown={onSeekDown}
                    onMouseUp={onSeekUp}
                />
            </div>

            {/* Three-zone bar: play stays dead-centre regardless of side widths */}
            <div className="vc-pill">
                <div className="vc-zone vc-left">
                    <time className="vc-time">{formatTime(currentTime)} <span>/</span> {formatTime(dur)}</time>
                    <div className="vc-vol">
                        <button className="vc-btn" title="Звук (M)" onClick={toggleMute}>
                            <i className={`bi ${volumeIcon(muted, volume)}`} />
                        </button>
                        <div className="vc-vol-popup">
                            <input
                                className="vc-vol-slider"
                                type="range"
                                min={0}
                                max={1}
                                step={0.02}
                                value={muted ? 0 : volume}
                                onChange={(e) => setVol(Number(e.target.value))}
                            />
                        </div>
                    </div>
                </div>

                <div className="vc-zone vc-center">
                    <button className="vc-btn" title="В начало" onClick={() => skipToSec(0)}>
                        <i className="bi bi-skip-start-fill" />
                    </button>
                    <button className="vc-btn" title="−10 c" onClick={() => skipSec(-10)}>
                        <i className="bi bi-rewind-fill" />
                    </button>
                    <button className="vc-btn vc-play" title="Пробел" onClick={togglePlay}>
                        <i className={`bi ${isPaused ? 'bi-play-fill' : 'bi-pause-fill'}`} />
                    </button>
                    <button className="vc-btn" title="+10 c" onClick={() => skipSec(10)}>
                        <i className="bi bi-fast-forward-fill" />
                    </button>
                    <button className="vc-btn" title="В конец" onClick={() => skipToSec(Number.MAX_VALUE)}>
                        <i className="bi bi-skip-end-fill" />
                    </button>
                </div>

                <div className="vc-zone vc-right">
                    <button
                        className={`vc-ab ${startRec !== null && endRec === null ? 'armed' : ''} ${abActive ? 'active' : ''}`}
                        title={abTitle}
                        onClick={handleAB}
                    >
                        {abLabel}
                    </button>
                    <button className="vc-btn vc-mode" title={mode.title} onClick={cyclePlayMode}>
                        <i className={`bi ${mode.icon}`} />
                    </button>
                    <div className="vc-speed-wrap" ref={speedRef}>
                        <button
                            className={`vc-speed ${rate !== 1 ? 'on' : ''}`}
                            title="Скорость ( < > )"
                            onClick={() => setSpeedOpen(v => !v)}
                            onWheel={(e) => { e.preventDefault(); bumpRate(e.deltaY < 0 ? 1 : -1); }}
                        >
                            {rate}×
                        </button>
                        {speedOpen && (
                            <div className="vc-speed-menu">
                                {SPEEDS.map(s => (
                                    <button
                                        key={s}
                                        className={s === rate ? 'active' : ''}
                                        onClick={() => { setPlaybackRate(s); setSpeedOpen(false); }}
                                    >
                                        {s}×
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {tools && (
                        <div className="vc-tools-wrap" ref={toolsRef}>
                            <button
                                className={`vc-btn ${toolsOpen ? 'on' : ''}`}
                                title="Инструменты"
                                onClick={() => setToolsOpen(v => !v)}
                                disabled={!!busy}
                            >
                                <i className="bi bi-tools" />
                            </button>
                            {toolsOpen && (
                                <div className="vc-tools-menu">
                                    <button onClick={() => { setToolsOpen(false); tools.captureFrame(); }}>
                                        <i className="bi bi-camera" />
                                        Сохранить кадр в библиотеку
                                    </button>
                                    {tools.setThumb && (
                                        <button onClick={() => { setToolsOpen(false); tools.setThumb(); }}>
                                            <i className="bi bi-image" />
                                            Сделать этот кадр превью
                                        </button>
                                    )}
                                    {tools.trim && (
                                        <button
                                            disabled={!abActive}
                                            title={abActive ? '' : 'Сначала отметьте A и B кнопкой «A‑B»'}
                                            onClick={() => { setToolsOpen(false); setTrimOpen(true); }}
                                        >
                                            <i className="bi bi-scissors" />
                                            Обрезать по A–B
                                        </button>
                                    )}
                                    {tools.canRevert && (
                                        <button onClick={startRevert}>
                                            <i className="bi bi-arrow-counterclockwise" />
                                            Вернуть оригинал
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    <button className="vc-btn" title="Картинка-в-картинке (P)" onClick={togglePip}>
                        <i className="bi bi-pip" />
                    </button>
                    <button className="vc-btn" title="На весь экран (F)" onClick={toggleFullscreen}>
                        <i className="bi bi-arrows-fullscreen" />
                    </button>
                    <button className="vc-btn" title="Свернуть панель" onClick={toggleCollapsed}>
                        <i className="bi bi-chevron-down" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VideoControls;
