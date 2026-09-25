import React, {useEffect, useRef, useState} from 'react';
import {SLIDESHOW_INTERVALS} from './useSlideshow';
import {FILE_TYPES} from '@/Constants';

const IDLE_MS = 2200;

// Slideshow controls. Out of the way while the show runs; the mouse brings them back
// for a moment, and they stay while paused. A thin bar counts down the image slide.
const SlideshowHud = ({ ss, file }) => {
    const [awake, setAwake] = useState(true);
    const [customOpen, setCustomOpen] = useState(false);
    const [custom, setCustom] = useState(String(ss.settings.interval));
    const timer = useRef(null);

    useEffect(() => {
        const wake = () => {
            setAwake(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setAwake(false), IDLE_MS);
        };
        wake();
        document.addEventListener('mousemove', wake);
        return () => { clearTimeout(timer.current); document.removeEventListener('mousemove', wake); };
    }, []);

    const visible = awake || ss.paused;
    const isImage = file?.type === FILE_TYPES.IMAGE;
    const isPreset = SLIDESHOW_INTERVALS.includes(Number(ss.settings.interval));

    const applyCustom = () => {
        const n = Math.round(Number(custom));
        if (n >= 1 && n <= 600) ss.setSettings({ interval: n });
        setCustomOpen(false);
    };

    return (
        <>
            {isImage && !ss.paused && (
                <div className="ss-progress">
                    <div
                        key={`${file.uniqueId}:${ss.settings.interval}`}
                        className="ss-progress-fill"
                        style={{ animationDuration: `${ss.settings.interval}s` }}
                    />
                </div>
            )}

            <div className={`ss-hud ${visible ? '' : 'idle'}`} onPointerDown={e => e.stopPropagation()}>
                <span className="ss-pos">{ss.position} / {ss.total}</span>

                <button className="ss-btn" title="Назад" onClick={ss.prev}><i className="bi bi-skip-backward-fill" /></button>
                <button className="ss-btn ss-play" title="Пауза / продолжить (S)" onClick={ss.togglePause}>
                    <i className={`bi ${ss.paused ? 'bi-play-fill' : 'bi-pause-fill'}`} />
                </button>
                <button className="ss-btn" title="Дальше" onClick={ss.next}><i className="bi bi-skip-forward-fill" /></button>

                <span className="ss-sep" />

                <div className="ss-intervals" title="Интервал для изображений">
                    {SLIDESHOW_INTERVALS.map(s => (
                        <button
                            key={s}
                            className={Number(ss.settings.interval) === s ? 'on' : ''}
                            onClick={() => ss.setSettings({ interval: s })}
                        >
                            {s}с
                        </button>
                    ))}
                    {customOpen ? (
                        <input
                            className="ss-custom"
                            autoFocus
                            type="number" min={1} max={600}
                            value={custom}
                            onChange={e => setCustom(e.target.value)}
                            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') applyCustom(); if (e.key === 'Escape') setCustomOpen(false); }}
                            onBlur={applyCustom}
                        />
                    ) : (
                        <button
                            className={!isPreset ? 'on' : ''}
                            onClick={() => { setCustom(String(ss.settings.interval)); setCustomOpen(true); }}
                        >
                            {!isPreset ? `${ss.settings.interval}с` : 'своё'}
                        </button>
                    )}
                </div>

                <button
                    className={`ss-btn ${ss.settings.shuffle ? 'on' : ''}`}
                    title="Вперемешку"
                    onClick={() => ss.setSettings({ shuffle: !ss.settings.shuffle })}
                >
                    <i className="bi bi-shuffle" />
                </button>
                <button
                    className={`ss-btn ${ss.settings.loop ? 'on' : ''}`}
                    title="По кругу"
                    onClick={() => ss.setSettings({ loop: !ss.settings.loop })}
                >
                    <i className="bi bi-repeat" />
                </button>

                <span className="ss-sep" />
                <button className="ss-btn ss-stop" title="Остановить слайдшоу" onClick={ss.stop}>
                    <i className="bi bi-stop-fill" />
                </button>
            </div>
        </>
    );
};

export default SlideshowHud;
