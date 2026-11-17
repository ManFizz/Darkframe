import React, {useCallback, useEffect, useRef, useState} from 'react';
import {httpFetch} from '@/Infrastructure/http';
import {matches} from '@services/keymap';

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

function mimeFor(file, src) {
    const m = String(file.mimeType || '');
    if (m === 'image/gif' || m === 'image/webp') return m;
    const ext = String(file.fileName || src || '').toLowerCase().split('?')[0].match(/\.(gif|webp)$/);
    return ext ? `image/${ext[1]}` : null;
}

export const isMaybeAnimated = (file, src) => !!mimeFor(file, src);

/**
 * An <img> that turns into a controllable player for animated GIF / WebP: pause,
 * frame-by-frame (, .), speed, scrubbing. Frames are decoded one at a time with
 * WebCodecs' ImageDecoder, so long animations don't sit in memory as bitmaps.
 * Stills (and browsers without ImageDecoder) stay a plain <img>.
 */
const AnimatedImage = ({ file, src, alt, style, onImgRef }) => {
    const canvasRef = useRef(null);
    const decoderRef = useRef(null);
    const timerRef = useRef(null);
    const [info, setInfo] = useState(null);      // { frames }
    const [frame, setFrame] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [speed, setSpeed] = useState(1);
    const frameRef = useRef(0);
    const playingRef = useRef(true);
    const speedRef = useRef(1);

    useEffect(() => { playingRef.current = playing; }, [playing]);
    useEffect(() => { speedRef.current = speed; }, [speed]);

    // Decode + draw one frame; returns its duration in ms.
    const draw = useCallback(async (index) => {
        const dec = decoderRef.current;
        const canvas = canvasRef.current;
        if (!dec || !canvas) return 100;
        const { image } = await dec.decode({ frameIndex: index });
        if (canvas.width !== image.displayWidth) canvas.width = image.displayWidth;
        if (canvas.height !== image.displayHeight) canvas.height = image.displayHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        const ms = (image.duration || 100000) / 1000;
        image.close();
        frameRef.current = index;
        setFrame(index);
        return Math.max(20, ms);
    }, []);

    const loop = useCallback(async () => {
        clearTimeout(timerRef.current);
        if (!playingRef.current || !decoderRef.current || !info) return;
        const next = (frameRef.current + 1) % info.frames;
        const ms = await draw(next);
        timerRef.current = setTimeout(loop, ms / speedRef.current);
    }, [draw, info]);

    // Set up the decoder for this file.
    useEffect(() => {
        const type = mimeFor(file, src);
        setInfo(null); setFrame(0); setPlaying(true); frameRef.current = 0;
        if (!type || typeof window.ImageDecoder === 'undefined') return;
        let cancelled = false;
        (async () => {
            try {
                if (!(await window.ImageDecoder.isTypeSupported(type))) return;
                const buf = await (/^(https?|file):/i.test(src)
                    ? await httpFetch(src, { binary: true })
                    : await fetch(src)).arrayBuffer();
                if (cancelled) return;
                const dec = new window.ImageDecoder({ data: buf, type });
                await dec.tracks.ready;
                const track = dec.tracks.selectedTrack;
                await dec.completed;
                if (cancelled || !track?.animated || track.frameCount < 2) { dec.close(); return; }
                decoderRef.current = dec;
                setInfo({ frames: track.frameCount });
            } catch { /* not decodable here — keep the <img> */ }
        })();
        return () => {
            cancelled = true;
            clearTimeout(timerRef.current);
            decoderRef.current?.close();
            decoderRef.current = null;
        };
    }, [src]);   // eslint-disable-line react-hooks/exhaustive-deps

    // Start / stop playback.
    useEffect(() => {
        if (!info) return;
        if (playing) {
            draw(frameRef.current).then(ms => { timerRef.current = setTimeout(loop, ms / speedRef.current); });
        } else {
            clearTimeout(timerRef.current);
        }
        return () => clearTimeout(timerRef.current);
    }, [info, playing, loop, draw]);

    const step = useCallback((d) => {
        if (!info) return;
        setPlaying(false);
        draw((frameRef.current + d + info.frames) % info.frames);
    }, [info, draw]);

    // Space: play / pause · , . : frame back / forward
    useEffect(() => {
        if (!info) return;
        const onKey = (e) => {
            const el = document.activeElement;
            if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || document.querySelector('.img-editor')) return;
            if (e.code === 'Space') { e.preventDefault(); setPlaying(p => !p); }
            if (matches(e, 'media.frameBack')) { e.preventDefault(); step(-1); }
            if (matches(e, 'media.frameFwd'))  { e.preventDefault(); step(1); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [info, step]);

    if (!info) return <img ref={onImgRef} alt={alt} src={src} style={style} draggable={false} onDragStart={e => e.preventDefault()} />;

    return (
        <>
            <canvas ref={canvasRef} className="anim-canvas" style={style} />
            <div className="anim-controls" onPointerDown={e => e.stopPropagation()}>
                <button onClick={() => step(-1)} title="Кадр назад (,)"><i aria-hidden="true" className="bi bi-skip-start-fill" /></button>
                <button className="anim-play" onClick={() => setPlaying(p => !p)} title="Пауза / пуск (пробел)">
                    <i aria-hidden="true" className={`bi ${playing ? 'bi-pause-fill' : 'bi-play-fill'}`} />
                </button>
                <button onClick={() => step(1)} title="Кадр вперёд (.)"><i aria-hidden="true" className="bi bi-skip-end-fill" /></button>
                <input type="range" min={0} max={info.frames - 1} value={frame}
                       onChange={e => { setPlaying(false); draw(Number(e.target.value)); }} />
                <span className="anim-frame">{frame + 1} / {info.frames}</span>
                <button className="anim-speed" onClick={() => setSpeed(s => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])} title="Скорость">
                    {speed}×
                </button>
            </div>
        </>
    );
};

export default AnimatedImage;
