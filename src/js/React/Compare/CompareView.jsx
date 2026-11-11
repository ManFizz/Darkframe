import React, {useCallback, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';

let opener = null;

/**
 * Compare two library items side by side.
 *   items: [a, b] — { id, title, url, thumb?, width, height, size, mimeType, importedAt, collectionName }
 *   pool: optional — all the items to pick the pair from (a group of duplicates);
 *         each side then gets a strip to pick its item, and trashing one keeps the
 *         compare open on what's left
 *   onDone(): called after one of them was moved to the trash (to refresh lists)
 *   onKeep(keepIt, dropIt): optional — "keep left/right" only reports the choice
 *         (the caller marks it for the trash) instead of trashing right away
 */
export function openCompare(items, { onDone, pool, onKeep } = {}) {
    if (opener && items?.length === 2) opener({ items, onDone, onKeep, pool: pool?.length > 2 ? pool : null });
}

// Library ThumbFile → compare item.
export function compareItemFromThumb(f) {
    const col = LibraryService.getCollections().find(c => c.id === f.collectionId);
    return {
        id: f.id, title: f.title, url: f.getUrl(), width: f.width, height: f.height,
        size: f.size, mimeType: f.mimeType, importedAt: f.importedAt,
        collectionName: col?.name || 'Без коллекции',
    };
}

const fmtSize = (b) => (b == null ? '—' : b < 1024 ** 2 ? `${Math.round(b / 1024)} КБ` : `${(b / 1024 ** 2).toFixed(2)} МБ`);
const fmtDate = (s) => (s ? new Date(s * 1000).toLocaleDateString('ru-RU') : '—');
const isVideo = (it) => String(it.mimeType || '').startsWith('video/');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const MODES = [
    { id: 'side',  label: 'Рядом',   icon: 'bi-layout-split' },
    { id: 'wipe',  label: 'Шторка',  icon: 'bi-vr' },
    { id: 'diff',  label: 'Разница', icon: 'bi-subtract' },
];

// Facts under each side; `better` marks the stronger value of the pair.
function facts(it, other) {
    const mp = (x) => (x.width && x.height ? x.width * x.height : 0);
    return [
        { k: 'Разрешение', v: it.width ? `${it.width}×${it.height}` : '—', better: mp(it) > mp(other) },
        { k: 'Мегапиксели', v: mp(it) ? `${(mp(it) / 1e6).toFixed(1)} Мп` : '—', better: mp(it) > mp(other) },
        { k: 'Размер', v: fmtSize(it.size), better: false },
        { k: 'Формат', v: (it.mimeType || '').split('/')[1]?.toUpperCase() || '—', better: false },
        { k: 'Добавлен', v: fmtDate(it.importedAt), better: (it.importedAt || 0) < (other.importedAt || 0) },
        { k: 'Коллекция', v: it.collectionName || '—', better: false },
    ];
}

const Media = ({ it, style, className }) => (isVideo(it)
    ? <video className={className} src={it.url} style={style} muted loop autoPlay playsInline />
    : <img className={className} src={it.url} style={style} alt="" draggable={false} />);

const CompareView = () => {
    const [state, setState] = useState(null);   // { items: [a, b], onDone }
    const [mode, setMode] = useState('side');
    const [view, setView] = useState({ z: 1, x: 0, y: 0 });
    const [wipe, setWipe] = useState(50);
    const [busy, setBusy] = useState(false);
    const drag = useRef(null);
    const stageRef = useRef(null);

    useEffect(() => {
        opener = (s) => { setState(s); setView({ z: 1, x: 0, y: 0 }); setWipe(50); setMode('side'); };
        return () => { opener = null; };
    }, []);

    const close = useCallback(() => setState(null), []);

    useEffect(() => {
        if (!state) return;
        const onKey = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); close(); }
            if (e.key === '0') setView({ z: 1, x: 0, y: 0 });
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [state, close]);

    if (!state) return null;
    const [a, b] = state.items;

    const onWheel = (e) => {
        const z2 = clamp(view.z * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 1, 16);
        if (z2 === 1) { setView({ z: 1, x: 0, y: 0 }); return; }
        const pane = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - pane.left - pane.width / 2;
        const my = e.clientY - pane.top - pane.height / 2;
        const k = z2 / view.z;
        setView({ z: z2, x: mx - (mx - view.x) * k, y: my - (my - view.y) * k });
    };

    const onDown = (e) => {
        if (e.button !== 0) return;
        if (mode === 'wipe' && e.target.closest('.cmp-wipe-handle')) {
            drag.current = { wipe: true };
        } else if (view.z > 1) {
            drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
        } else return;
        e.preventDefault();
        const onMove = (ev) => {
            const d = drag.current;
            if (!d) return;
            if (d.wipe) {
                const r = stageRef.current.getBoundingClientRect();
                setWipe(clamp(((ev.clientX - r.left) / r.width) * 100, 0, 100));
            } else setView(v => ({ ...v, x: d.ox + ev.clientX - d.sx, y: d.oy + ev.clientY - d.sy }));
        };
        const onUp = () => { drag.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    const tf = { transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` };

    // A pool: go on with the kept one against the next of the rest.
    const goOn = (keepIt, dropIt) => {
        const rest = state.pool?.filter(it => it.id !== dropIt.id);
        const next = rest?.find(it => it.id !== keepIt.id);
        if (next) {
            const items = state.items[0].id === keepIt.id ? [keepIt, next] : [next, keepIt];
            setState(s => ({ ...s, items, pool: rest.length > 2 ? rest : null }));
        } else close();
    };

    const keep = async (keepIt, dropIt) => {
        if (state.onKeep) {   // only marking — the caller trashes later
            state.onKeep(keepIt, dropIt);
            goOn(keepIt, dropIt);
            return;
        }
        setBusy(true);
        try {
            await LibraryService.deleteItem(dropIt.id, false);
            notify({
                message: `«${dropIt.title}» — в корзину, оставлен «${keepIt.title}»`,
                type: 'success',
                duration: 8000,
                action: { label: 'Вернуть', onClick: async () => { await LibraryService.restoreItem(dropIt.id); state.onDone?.(); } },
            });
            state.onDone?.();
            goOn(keepIt, dropIt);
        } finally {
            setBusy(false);
        }
    };
    const dropWord = state.onKeep ? 'отметить для корзины' : 'в корзину';

    const swap = () => setState(s => ({ ...s, items: [s.items[1], s.items[0]] }));
    // Put `it` on side `i`; picking the other side's item swaps them.
    const pick = (i, it) => setState(s => {
        const items = [...s.items];
        if (items[1 - i].id === it.id) items[1 - i] = items[i];
        items[i] = it;
        return { ...s, items };
    });

    const Info = ({ it, other, side }) => (
        <div className={`cmp-info ${side}`}>
            {state.pool && (
                <div className="cmp-pick">
                    {state.pool.map((p, n) => (
                        <button key={p.id} className={p.id === it.id ? 'active' : p.id === other.id ? 'other' : ''}
                                onClick={() => pick(side === 'left' ? 0 : 1, p)}
                                title={`${n + 1}. ${p.width ? `${p.width}×${p.height} · ` : ''}${fmtSize(p.size)} · ${p.collectionName || ''}`}>
                            <img src={p.thumb || p.url} alt="" draggable={false} />
                            <span>{n + 1}</span>
                        </button>
                    ))}
                </div>
            )}
            <div className="cmp-title" title={it.title}>{it.title}</div>
            <div className="cmp-facts">
                {facts(it, other).map(f => (
                    <span key={f.k} className={f.better ? 'better' : ''} title={f.k}><small>{f.k}</small>{f.v}</span>
                ))}
            </div>
        </div>
    );

    return createPortal(
        <div className="cmp-overlay" data-bs-theme="dark">
            <div className="cmp-top">
                <div className="cmp-modes">
                    {MODES.map(m => (
                        <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}
                                disabled={m.id !== 'side' && (isVideo(a) || isVideo(b))}>
                            <i className={`bi ${m.icon}`} /> {m.label}
                        </button>
                    ))}
                </div>
                <span className="cmp-hint">Колесо — масштаб (синхронно), перетаскивание — сдвиг, 0 — сброс</span>
                <button className="cmp-icon" onClick={swap} title="Поменять местами"><i className="bi bi-arrow-left-right" /></button>
                <button className="cmp-icon" onClick={close} title="Закрыть (Esc)"><i className="bi bi-x-lg" /></button>
            </div>

            <div className={`cmp-stage mode-${mode}`} ref={stageRef} onPointerDown={onDown}>
                {mode === 'side' && [a, b].map((it, i) => (
                    <div key={i} className="cmp-pane" onWheel={onWheel}>
                        <Media it={it} style={tf} className="cmp-media" />
                    </div>
                ))}
                {mode !== 'side' && (
                    <div className="cmp-pane single" onWheel={onWheel}>
                        <Media it={a} style={tf} className="cmp-media" />
                        <div className={`cmp-layer ${mode}`} style={mode === 'wipe' ? { clipPath: `inset(0 0 0 ${wipe}%)` } : undefined}>
                            <Media it={b} style={tf} className="cmp-media" />
                        </div>
                        {mode === 'wipe' && (
                            <div className="cmp-wipe-handle" style={{ left: `${wipe}%` }}>
                                <span><i className="bi bi-chevron-left" /><i className="bi bi-chevron-right" /></span>
                            </div>
                        )}
                        {mode === 'diff' && <div className="cmp-diff-note">Чёрное — совпадает, светлое — отличается</div>}
                    </div>
                )}
            </div>

            <div className="cmp-bottom">
                <Info it={a} other={b} side="left" />
                <div className="cmp-actions">
                    <button className="cmp-btn" disabled={busy} onClick={() => keep(a, b)} title={`Правый — ${dropWord}`}>
                        <i className="bi bi-arrow-left" /> Оставить левый
                    </button>
                    <button className="cmp-btn ghost" onClick={close}>Оставить оба</button>
                    <button className="cmp-btn" disabled={busy} onClick={() => keep(b, a)} title={`Левый — ${dropWord}`}>
                        Оставить правый <i className="bi bi-arrow-right" />
                    </button>
                </div>
                <Info it={b} other={a} side="right" />
            </div>
        </div>,
        document.body,
    );
};

export default CompareView;
