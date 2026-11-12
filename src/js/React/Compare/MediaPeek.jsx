import React, {useEffect, useState} from 'react';
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
const MediaPeek = ({ items, index = 0, onClose }) => {
    const [i, setI] = useState(index);
    const [full, setFull] = useState(false);
    const it = items[i];
    const many = items.length > 1;

    const go = (d) => { setI(n => (n + d + items.length) % items.length); setFull(false); };

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowLeft' && many) go(-1);
            else if (e.key === 'ArrowRight' && many) go(1);
            else return;
            e.preventDefault();
            e.stopPropagation();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    });   // eslint-disable-line react-hooks/exhaustive-deps

    if (!it) return null;
    return createPortal(
        <div className="peek-overlay" data-bs-theme="dark" onContextMenu={e => e.preventDefault()}>
            <div className={`peek-stage ${full ? 'full' : ''}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
                {isVideo(it)
                    ? <video key={it.id} className="peek-media" src={it.url} controls autoPlay loop />
                    : <img key={it.id} className="peek-media" src={it.url} alt={it.title} draggable={false}
                           title={full ? 'Вписать в экран' : 'Реальный размер'} onClick={() => setFull(f => !f)} />}
            </div>
            {many && (
                <>
                    <button className="peek-nav prev" onClick={() => go(-1)} title="Предыдущий (←)"><i aria-hidden="true" className="bi bi-chevron-left" /></button>
                    <button className="peek-nav next" onClick={() => go(1)} title="Следующий (→)"><i aria-hidden="true" className="bi bi-chevron-right" /></button>
                </>
            )}
            <button className="peek-close" onClick={onClose} title="Закрыть (Esc)"><i aria-hidden="true" className="bi bi-x-lg" /></button>
            <div className="peek-caption">
                {many && <b>{i + 1} / {items.length}</b>}
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
