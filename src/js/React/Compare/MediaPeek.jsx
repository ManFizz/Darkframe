import React, {useCallback, useEffect, useState} from 'react';
import {createPortal} from 'react-dom';

const fmtSize = (b) => (b == null ? '—' : b < 1024 ** 2 ? `${Math.round(b / 1024)} КБ` : `${(b / 1024 ** 2).toFixed(2)} МБ`);
const isVideo = (it) => String(it.mimeType || '').startsWith('video/');

/**
 * Full-size look at one of a few library items, over everything.
 *   items: [{ id, title, url, width, height, size, mimeType, collectionName }]
 *   index: the one to show first; ←/→ go through the rest
 * Fits the screen; a click on the image shows it at its real size (scrollable).
 * Esc, the cross or a click beside the image closes it.
 */
const MediaPeek = ({ items = [], index = 0, onClose }) => {
    const n = items.length;
    const [i, setI] = useState(() => (n ? Math.min(Math.max(0, index), n - 1) : 0));
    const [full, setFull] = useState(false);
    const many = n > 1;

    // Parent opened on another thumb.
    useEffect(() => {
        if (!n) return;
        setI(Math.min(Math.max(0, index), n - 1));
        setFull(false);
    }, [index]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the opener asks

    // Group shrank (e.g. trash) — stay on the same slot when possible.
    useEffect(() => {
        if (!n) return;
        setI(cur => Math.min(cur, n - 1));
    }, [n]);

    const go = useCallback((d) => {
        if (n < 2) return;
        setI(cur => (cur + d + n) % n);
        setFull(false);
    }, [n]);

    useEffect(() => {
        const onKey = (e) => {
            // Keep viewer/library shortcuts quiet while the peek owns the screen.
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
            else if (e.key === 'ArrowLeft' && many) { e.preventDefault(); go(-1); }
            else if (e.key === 'ArrowRight' && many) { e.preventDefault(); go(1); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [go, many, onClose]);

    if (!n) return null;
    const it = items[i];
    if (!it) return null;

    return createPortal(
        <div className="peek-overlay" data-bs-theme="dark" onContextMenu={e => e.preventDefault()}>
            <div className={`peek-stage ${full ? 'full' : ''}`} onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
                {isVideo(it)
                    ? <video key={it.id} className="peek-media" src={it.url} controls autoPlay loop />
                    : <img key={it.id} className="peek-media" src={it.url} alt={it.title} draggable={false}
                           title={full ? 'Вписать в экран' : 'Реальный размер'} onClick={() => setFull(f => !f)} />}
            </div>
            {many && (
                <>
                    <button type="button" className="peek-nav prev" onClick={() => go(-1)} title="Предыдущий (←)"><i aria-hidden="true" className="bi bi-chevron-left" /></button>
                    <button type="button" className="peek-nav next" onClick={() => go(1)} title="Следующий (→)"><i aria-hidden="true" className="bi bi-chevron-right" /></button>
                </>
            )}
            <button type="button" className="peek-close" onClick={() => onClose?.()} title="Закрыть (Esc)"><i aria-hidden="true" className="bi bi-x-lg" /></button>
            <div className="peek-caption">
                {many && <b>{i + 1} / {n}</b>}
                <span>{it.collectionName}</span>
                {it.width ? <span>{it.width}×{it.height}</span> : null}
                <span>{fmtSize(it.size)}</span>
                <span className="peek-title" title={it.title}>{it.title}</span>
            </div>
        </div>,
        document.body,
    );
};

export default MediaPeek;
