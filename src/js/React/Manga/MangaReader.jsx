import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {cachedMediaUrl} from '@/Infrastructure/MediaCache';
import {matches} from '@services/keymap';
import {notify} from '@services/NotificationService';
import {swipeHandlers} from '@services/mobile';
import {exitViewerFullscreen, toggleViewerFullscreen} from '../Modal/fullscreen';
import {looksVertical, readerPrefs, registerReader, saveReaderPrefs} from './readerStore';

const MODES = [
    { id: 'paged', label: 'Страница', icon: 'bi-file-earmark' },
    { id: 'double', label: 'Разворот', icon: 'bi-book' },
    { id: 'vertical', label: 'Лента', icon: 'bi-distribute-vertical' },
];
const FITS = [
    { id: 'screen', label: 'Целиком', icon: 'bi-aspect-ratio' },
    { id: 'height', label: 'По высоте', icon: 'bi-arrows-vertical' },
    { id: 'width', label: 'По ширине', icon: 'bi-arrows' },
    { id: 'original', label: 'Оригинал', icon: 'bi-1-square' },
];
const src = (p) => cachedMediaUrl(p.url);
const isWide = (p) => p.w > 0 && p.h > 0 && p.w > p.h * 1.15;

// Spreads for the double-page mode: the cover (optionally) and wide pages alone.
function buildSpreads(pages, mode, doubleOffset) {
    if (mode !== 'double') return pages.map((_, i) => [i]);
    const out = [];
    let i = 0;
    if (doubleOffset && pages.length) { out.push([0]); i = 1; }
    while (i < pages.length) {
        if (isWide(pages[i]) || i + 1 >= pages.length || isWide(pages[i + 1])) { out.push([i]); i += 1; }
        else { out.push([i, i + 1]); i += 2; }
    }
    return out;
}

const ReaderView = ({ book, onClose }) => {
    const [chapters, setChapters] = useState(book.chapters);
    const startCh = Math.max(0, book.chapters.findIndex(c => c.id === book.start?.chapter));
    const [ch, setCh] = useState(startCh);
    const [page, setPage] = useState(book.start?.page || 0);
    const [prefs, setPrefs] = useState(() => {
        const p = readerPrefs();
        const firstPages = book.chapters[startCh]?.pages;
        const auto = looksVertical(firstPages) ? 'vertical' : null;
        // Mode and direction are the viewer's choice, the same for every book; only
        // webtoon strips (tall pages, or marked so by the site) open as a strip.
        return { ...p, mode: book.reading?.mode === 'vertical' || auto ? 'vertical' : p.mode };
    });
    const [ui, setUi] = useState(true);
    // Touch screens: tap zones are explained once.
    const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
    const [hint, setHint] = useState(() => { try { return touch && !localStorage.getItem('jsg_reader_hint'); } catch { return false; } });
    const dismissHint = () => { setHint(false); try { localStorage.setItem('jsg_reader_hint', '1'); } catch { /* ignore */ } };
    const [thumbs, setThumbs] = useState(false);
    const [menu, setMenu] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [auto, setAuto] = useState(false);
    const [jump, setJump] = useState(null);
    const [error, setError] = useState(null);
    const [retry, setRetry] = useState(0);
    const stageRef = useRef(null);
    const hideTimer = useRef(null);
    const wheelAcc = useRef(0);

    const chapter = chapters[ch];
    const pages = chapter?.pages || null;
    const total = useMemo(() => chapters.reduce((n, c) => n + (c.pages?.length || 0), 0), [chapters]);
    const offset = useMemo(() => chapters.slice(0, ch).reduce((n, c) => n + (c.pages?.length || 0), 0), [chapters, ch]);
    const vertical = prefs.mode === 'vertical';
    const spreads = useMemo(() => (pages ? buildSpreads(pages, prefs.mode, prefs.doubleOffset) : []), [pages, prefs.mode, prefs.doubleOffset]);
    const spreadIdx = Math.max(0, spreads.findIndex(s => s.includes(page)));

    // Lazily loaded chapters (online sources).
    useEffect(() => {
        setError(null);
        if (pages || !book.loadChapter || !chapter) return;
        let cancelled = false;
        book.loadChapter(chapter.id)
            .then(list => { if (!cancelled) setChapters(cs => cs.map((c, i) => (i === ch ? { ...c, pages: list } : c))); })
            .catch(e => { if (!cancelled) setError(e.message || String(e)); });
        return () => { cancelled = true; };
    }, [ch, pages, book, chapter, retry]);

    // A chapter loaded lazily: the webtoon check couldn't run at the start.
    const autoChecked = useRef(book.reading?.mode === 'vertical' || !!book.chapters[startCh]?.pages);
    useEffect(() => {
        if (autoChecked.current || !pages) return;
        autoChecked.current = true;
        if (looksVertical(pages)) setPrefs(p => ({ ...p, mode: 'vertical' }));
    }, [pages]);

    // Remembered for good: the next book opens the same way.
    const setPref = useCallback((patch) => {
        setPrefs(p => ({ ...p, ...patch }));
        saveReaderPrefs(patch);
    }, []);

    // Progress (debounced).
    useEffect(() => {
        if (!pages || !book.onProgress) return;
        const t = setTimeout(() => book.onProgress({ chapter: chapter.id, page, position: offset + page, total }), 600);
        return () => clearTimeout(t);
    }, [page, ch, pages, total, offset, book, chapter]);

    // UI hides after a moment of no mouse movement; it stays while the pointer is
    // over the bars / panels.
    const overUi = useRef(false);
    const wake = useCallback(() => {
        setUi(true);
        clearTimeout(hideTimer.current);
        const hide = () => { if (overUi.current) hideTimer.current = setTimeout(hide, 1200); else setUi(false); };
        hideTimer.current = setTimeout(hide, 2600);
    }, []);
    useEffect(() => { wake(); return () => clearTimeout(hideTimer.current); }, [wake]);

    // Turning pages never brings the bars up — and hides them, unless they're in use.
    const firstPage = useRef(true);
    useEffect(() => {
        if (firstPage.current) { firstPage.current = false; return; }
        if (overUi.current) return;
        clearTimeout(hideTimer.current);
        setUi(false);
    }, [page, ch]);

    // Only a real mouse move shows the bars: the hand resting on the mouse while
    // clicking through pages jitters by a pixel or two.
    const lastPtr = useRef(null);
    const onMouseMove = (e) => {
        // Touch: taps also send mouse moves — the bars are shown / hidden by taps only.
        if (touch) return;
        overUi.current = !!e.target.closest?.('.rd-top, .rd-bottom, .rd-thumbs, .rd-menu');
        const l = lastPtr.current;
        lastPtr.current = { x: e.clientX, y: e.clientY };
        if (overUi.current) { wake(); return; }
        if (!l) return;
        if (Math.hypot(e.clientX - l.x, e.clientY - l.y) > 14) wake();
        else lastPtr.current = l;   // small moves add up from the same point
    };

    // Preload the next pages.
    useEffect(() => {
        if (!pages || vertical) return;
        const last = spreads[spreadIdx]?.slice(-1)[0] ?? page;
        pages.slice(last + 1, last + 5).forEach(p => { const i = new Image(); i.src = src(p); });
    }, [pages, page, spreadIdx, spreads, vertical]);

    // The current page → a separate image in the library (book.savePage does the work).
    const [saving, setSaving] = useState(false);
    const savePage = useCallback(async () => {
        const p = pages?.[page];
        if (!p || !book.savePage || saving) return;
        setSaving(true);
        try {
            const res = await book.savePage(p, { page: page + 1, chapter, chapterTitle: chapters.length > 1 ? (chapter?.title || `Глава ${ch + 1}`) : '' });
            if (res?.skipped) {
                notify({ message: res.reason === 'trashed' ? 'Эта страница уже лежит в корзине библиотеки' : `Страница уже есть в библиотеке · «${res.collectionName}»`, type: 'info' });
            } else {
                notify({ message: `Страница ${page + 1} сохранена в библиотеку · Ctrl+Z — отменить`, type: 'success' });
            }
        } catch (e) {
            notify({ message: `Не удалось сохранить: ${String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, type: 'warning' });
        } finally {
            setSaving(false);
        }
    }, [pages, page, book, saving, chapter, chapters.length, ch]);

    const goChapter = useCallback((i, where = 'start') => {
        if (i < 0 || i >= chapters.length) return false;
        setCh(i);
        setZoom(1);
        const len = chapters[i].pages?.length || 0;
        setPage(where === 'end' && len ? len - 1 : 0);
        stageRef.current?.scrollTo({ top: 0 });
        return true;
    }, [chapters]);

    const [atEnd, setAtEnd] = useState(false);
    const next = useCallback(() => {
        if (!pages) return;
        if (spreadIdx < spreads.length - 1) { setPage(spreads[spreadIdx + 1][0]); stageRef.current?.scrollTo({ top: 0 }); return; }
        if (!goChapter(ch + 1)) setAtEnd(true);
    }, [pages, spreadIdx, spreads, ch, goChapter]);
    const prev = useCallback(() => {
        // From the "the end" card back to the last page, not one before it.
        if (atEnd) { setAtEnd(false); return; }
        if (!pages) return;
        if (spreadIdx > 0) { setPage(spreads[spreadIdx - 1][0]); stageRef.current?.scrollTo({ top: 0 }); return; }
        goChapter(ch - 1, 'end');
    }, [atEnd, pages, spreadIdx, spreads, ch, goChapter]);

    // Pages still loading (online ones can take a while): a placeholder with the
    // page number instead of an empty screen, and "Повторить" if one fails.
    const [loadState, setLoadState] = useState(() => new Map());   // url → 'ok' | 'err'
    const [reloadKey, setReloadKey] = useState(() => new Map());   // url → n (remount to retry)
    const markLoad = useCallback((url, st) => setLoadState(m => (m.get(url) === st ? m : new Map(m).set(url, st))), []);
    const retryPage = useCallback((url) => {
        setLoadState(m => { const n = new Map(m); n.delete(url); return n; });
        setReloadKey(m => new Map(m).set(url, (m.get(url) || 0) + 1));
    }, []);
    const imgEvents = (p) => ({
        onLoad: () => markLoad(p.url, 'ok'),
        onError: () => markLoad(p.url, 'err'),
    });

    // ─── Vertical (webtoon) mode ──────────────────────────────────────────────
    const imgRefs = useRef([]);
    const scrollToPage = useCallback((i, smooth = false) => {
        const el = imgRefs.current[i];
        if (el) el.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
    }, []);
    // Restore the position when the column (re)appears.
    useLayoutEffect(() => {
        if (vertical && pages) requestAnimationFrame(() => scrollToPage(page));
    }, [vertical, pages, ch]);   // eslint-disable-line react-hooks/exhaustive-deps
    const onVerticalScroll = useCallback(() => {
        const stage = stageRef.current;
        if (!stage || !pages) return;
        const line = stage.getBoundingClientRect().top + stage.clientHeight * 0.35;
        let cur = 0;
        for (let i = 0; i < imgRefs.current.length; i++) {
            const el = imgRefs.current[i];
            if (el && el.getBoundingClientRect().top <= line) cur = i; else if (el) break;
        }
        setPage(p => (p === cur ? p : cur));
        setAtEnd(stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 4 && ch === chapters.length - 1);
    }, [pages, ch, chapters.length]);

    // Autoscroll for the vertical mode.
    useEffect(() => {
        if (!auto || !vertical) return;
        let raf, last = performance.now();
        const step = (t) => {
            const stage = stageRef.current;
            if (stage) stage.scrollTop += (prefs.autoSpeed * (t - last)) / 1000;
            last = t;
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [auto, vertical, prefs.autoSpeed]);

    // ─── Keyboard ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e) => {
            // Text fields keep their keys; the page slider / checkboxes / whatever had
            // focus behind the reader don't take the arrows away from it.
            if (e.target.closest?.('input:not([type=range]):not([type=radio]):not([type=checkbox]):not([type=button]), textarea, select')) {
                if (e.key === 'Escape') e.target.blur();
                return;
            }
            const rtl = prefs.direction === 'rtl' && !vertical;
            let handled = true;
            if (e.key === 'Escape') { if (thumbs) setThumbs(false); else if (menu) setMenu(false); else onClose(); }
            else if (matches(e, 'reader.mode')) setPref({ mode: MODES[(MODES.findIndex(m => m.id === prefs.mode) + 1) % MODES.length].id });
            else if (matches(e, 'reader.direction')) setPref({ direction: prefs.direction === 'rtl' ? 'ltr' : 'rtl' });
            else if (matches(e, 'reader.fit')) setPref({ fit: FITS[(FITS.findIndex(f => f.id === prefs.fit) + 1) % FITS.length].id });
            else if (matches(e, 'reader.thumbs')) setThumbs(v => !v);
            else if (matches(e, 'reader.savePage')) savePage();
            else if (matches(e, 'reader.fullscreen')) toggleViewerFullscreen();
            else if (matches(e, 'reader.autoscroll')) setAuto(v => !v);
            else if (matches(e, 'reader.nextChapter')) goChapter(ch + 1);
            else if (matches(e, 'reader.prevChapter')) goChapter(ch - 1);
            else if (vertical) {
                const stage = stageRef.current;
                if (e.key === ' ' || e.key === 'PageDown') stage.scrollBy({ top: (e.shiftKey ? -0.9 : 0.9) * stage.clientHeight, behavior: 'smooth' });
                else if (e.key === 'PageUp') stage.scrollBy({ top: -0.9 * stage.clientHeight, behavior: 'smooth' });
                else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    // Plain scrolling, like a browser page (held key — continuous).
                    const dy = (e.key === 'ArrowDown' ? 1 : -1) * (e.repeat ? 70 : 120);
                    stage.scrollBy({ top: dy, behavior: e.repeat ? 'auto' : 'smooth' });
                }
                else if (e.key === 'ArrowRight') scrollToPage(Math.min((pages?.length || 1) - 1, page + 1), true);
                else if (e.key === 'ArrowLeft') scrollToPage(Math.max(0, page - 1), true);
                else if (e.key === 'Home') scrollToPage(0);
                else if (e.key === 'End') scrollToPage((pages?.length || 1) - 1);
                else handled = false;
            } else {
                if (e.key === 'ArrowRight') (rtl ? prev : next)();
                else if (e.key === 'ArrowLeft') (rtl ? next : prev)();
                else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    // A page taller than the screen (fit to width, zoom): scroll it.
                    stageRef.current?.scrollBy({ top: (e.key === 'ArrowDown' ? 1 : -1) * (e.repeat ? 70 : 120), behavior: e.repeat ? 'auto' : 'smooth' });
                }
                else if (e.key === ' ' || e.key === 'PageDown') {
                    const stage = stageRef.current;
                    if (stage && stage.scrollTop + stage.clientHeight < stage.scrollHeight - 4 && !e.shiftKey) stage.scrollBy({ top: 0.9 * stage.clientHeight, behavior: 'smooth' });
                    else (e.shiftKey ? prev : next)();
                }
                else if (e.key === 'PageUp') prev();
                else if (e.key === 'Home') setPage(0);
                else if (e.key === 'End') setPage(spreads[spreads.length - 1]?.[0] || 0);
                else if (e.key === '0') setZoom(1);
                else if (e.key === '+' || e.key === '=') setZoom(z => Math.min(4, z + 0.25));
                else if (e.key === '-') setZoom(z => Math.max(0.5, z - 0.25));
                else handled = false;
            }
            // Settings keys show the bars (to see what changed); turning pages doesn't.
            const turn = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key)
                || matches(e, 'reader.nextChapter') || matches(e, 'reader.prevChapter');
            if (handled) { e.preventDefault(); if (!turn && e.key !== 'Escape') wake(); }
            e.stopPropagation();   // nothing behind the reader reacts
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [prefs, vertical, thumbs, menu, onClose, setPref, goChapter, ch, pages, page, spreads, next, prev, scrollToPage, wake, savePage]);

    useEffect(() => () => exitViewerFullscreen(), []);
    // The button that opened the reader (or a tab radio) keeps focus otherwise.
    useEffect(() => { document.activeElement?.blur?.(); }, []);

    // ─── Paged: wheel turns the page once the current one is scrolled through ──
    const onWheel = (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            setZoom(z => Math.min(4, Math.max(0.5, +(z * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(2))));
            return;
        }
        if (vertical) return;
        const stage = stageRef.current;
        const atBottom = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2;
        const atTop = stage.scrollTop <= 0;
        if ((e.deltaY > 0 && atBottom) || (e.deltaY < 0 && atTop)) {
            wheelAcc.current += e.deltaY;
            if (Math.abs(wheelAcc.current) > 160) {
                (wheelAcc.current > 0 ? next : prev)();
                wheelAcc.current = 0;
            }
        } else wheelAcc.current = 0;
    };

    const onStageClick = (e) => {
        if (vertical || e.target.closest('.rd-endcard')) { setUi(v => !v); return; }
        const r = stageRef.current.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const rtl = prefs.direction === 'rtl';
        if (x < 0.33) (rtl ? next : prev)();
        else if (x > 0.67) (rtl ? prev : next)();
        else setUi(v => !v);
    };

    // Drag to pan when zoomed / larger than the screen.
    const drag = useRef(null);
    const onPointerDown = (e) => {
        if (e.button !== 0 || vertical) return;
        const stage = stageRef.current;
        drag.current = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop, moved: false };
    };
    const onPointerMove = (e) => {
        const d = drag.current;
        if (!d || !(e.buttons & 1)) { drag.current = null; return; }
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
        stageRef.current.scrollLeft = d.l - dx;
        stageRef.current.scrollTop = d.t - dy;
    };
    const onClickCapture = (e) => { if (drag.current?.moved) { e.stopPropagation(); } drag.current = null; };

    const fitClass = `fit-${prefs.fit}`;
    const pos = offset + page + 1;
    const spreadPages = spreads[spreadIdx] || [];
    const nextChapter = chapters[ch + 1];

    const mediaStyle = (p, count) => {
        if (prefs.fit === 'original') return { width: p.w ? p.w * zoom : undefined };
        if (prefs.fit === 'width') return { width: `${(100 / count) * zoom}%` };
        if (prefs.fit === 'height') return { height: `${100 * zoom}%`, maxWidth: 'none' };
        return { maxHeight: `${100 * zoom}%`, maxWidth: `${(100 / count) * zoom}%` };
    };

    return createPortal(
        <div className={`rd bg-${prefs.background} ${ui ? '' : 'rd-hidden-ui'} ${vertical ? 'is-vertical' : ''}`}
             onMouseMove={onMouseMove}>
            <div className="rd-top">
                <button className="rd-btn" onClick={onClose} title="Закрыть (Esc)"><i className="bi bi-arrow-left" /></button>
                <div className="rd-title" title={book.title}>
                    <div className="rd-title-main">{book.title}</div>
                    {chapters.length > 1 && (
                        <select className="rd-chapter" value={ch} onChange={e => goChapter(Number(e.target.value))}>
                            {chapters.map((c, i) => <option key={c.id} value={i}>{c.title || `Глава ${i + 1}`}</option>)}
                        </select>
                    )}
                </div>
                {book.savePage && (
                    <button className="rd-btn" onClick={savePage} disabled={saving || !pages}
                            title={`Сохранить страницу ${page + 1} в библиотеку отдельной картинкой (S)`}>
                        <i className={`bi ${saving ? 'bi-arrow-repeat spin' : 'bi-file-earmark-arrow-down'}`} />
                    </button>
                )}
                <div className="rd-seg" title="Режим (V)">
                    {MODES.map(m => (
                        <button key={m.id} className={prefs.mode === m.id ? 'on' : ''} onClick={() => setPref({ mode: m.id })} title={m.label}>
                            <i className={`bi ${m.icon}`} /><span>{m.label}</span>
                        </button>
                    ))}
                </div>
                {!vertical && (
                    <button className="rd-btn" onClick={() => setPref({ direction: prefs.direction === 'rtl' ? 'ltr' : 'rtl' })}
                            title={prefs.direction === 'rtl' ? 'Справа налево (D)' : 'Слева направо (D)'}>
                        <i className={`bi ${prefs.direction === 'rtl' ? 'bi-arrow-left-square' : 'bi-arrow-right-square'}`} />
                        <span className="rd-btn-text">{prefs.direction === 'rtl' ? 'RTL' : 'LTR'}</span>
                    </button>
                )}
                {!vertical && (
                    <button className="rd-btn" onClick={() => setPref({ fit: FITS[(FITS.findIndex(f => f.id === prefs.fit) + 1) % FITS.length].id })}
                            title={`Подгонка: ${FITS.find(f => f.id === prefs.fit)?.label} (W)`}>
                        <i className={`bi ${FITS.find(f => f.id === prefs.fit)?.icon}`} />
                    </button>
                )}
                {vertical && (
                    <button className={`rd-btn ${auto ? 'on' : ''}`} onClick={() => setAuto(v => !v)} title="Автопрокрутка (A)">
                        <i className={`bi ${auto ? 'bi-pause-fill' : 'bi-play-fill'}`} />
                    </button>
                )}
                <button className={`rd-btn ${thumbs ? 'on' : ''}`} onClick={() => setThumbs(v => !v)} title="Миниатюры (G)"><i className="bi bi-grid-3x3-gap" /></button>
                <button className={`rd-btn ${menu ? 'on' : ''}`} onClick={() => setMenu(v => !v)} title="Настройки"><i className="bi bi-sliders" /></button>
                <button className="rd-btn" onClick={toggleViewerFullscreen} title="Во весь экран (F)"><i className="bi bi-fullscreen" /></button>
                {(book.actions || []).map(a => (
                    <button key={a.id} className="rd-btn rd-action" onClick={() => a.run({ close: onClose })} title={a.label}>
                        <i className={`bi ${a.icon}`} /><span className="rd-btn-text">{a.label}</span>
                    </button>
                ))}
            </div>

            {menu && (
                <div className="rd-menu" onMouseDown={e => e.stopPropagation()}>
                    {vertical ? (
                        <>
                            <label>Ширина ленты: <b>{prefs.verticalWidth}px</b>
                                <input type="range" min={400} max={1800} step={20} value={prefs.verticalWidth} onChange={e => setPref({ verticalWidth: Number(e.target.value) })} /></label>
                            <label>Промежуток между страницами: <b>{prefs.gap}px</b>
                                <input type="range" min={0} max={40} step={2} value={prefs.gap} onChange={e => setPref({ gap: Number(e.target.value) })} /></label>
                            <label>Скорость автопрокрутки: <b>{prefs.autoSpeed}</b>
                                <input type="range" min={20} max={600} step={10} value={prefs.autoSpeed} onChange={e => setPref({ autoSpeed: Number(e.target.value) })} /></label>
                        </>
                    ) : (
                        <>
                            <div className="rd-menu-row">Подгонка:
                                {FITS.map(f => <button key={f.id} className={prefs.fit === f.id ? 'on' : ''} onClick={() => setPref({ fit: f.id })}>{f.label}</button>)}
                            </div>
                            {prefs.mode === 'double' && (
                                <label className="rd-check"><input type="checkbox" checked={prefs.doubleOffset} onChange={e => setPref({ doubleOffset: e.target.checked })} /> Обложка отдельно (сдвиг разворотов)</label>
                            )}
                        </>
                    )}
                    <div className="rd-menu-row">Фон:
                        {[['dark', 'Тёмный'], ['black', 'Чёрный'], ['light', 'Светлый']].map(([id, l]) => (
                            <button key={id} className={prefs.background === id ? 'on' : ''} onClick={() => setPref({ background: id })}>{l}</button>
                        ))}
                    </div>
                    <div className="rd-menu-hint">Клик по краям — листать, по центру — скрыть панели. Ctrl+колесо — масштаб.</div>
                </div>
            )}

            <div ref={stageRef}
                 className={`rd-stage ${vertical ? '' : `paged ${fitClass} dir-${prefs.direction}`} ${zoom > 1 ? 'zoomed' : ''}`}
                 onWheel={onWheel}
                 onScroll={vertical ? onVerticalScroll : undefined}
                 onClick={onStageClick}
                 onPointerDown={onPointerDown}
                 onPointerMove={onPointerMove}
                 onClickCapture={onClickCapture}
                 {...swipeHandlers((dir) => {
                     // Swipe like turning a paper page: in right-to-left manga the
                     // next page comes from the left (swipe to the right).
                     const rtl = prefs.direction === 'rtl';
                     if (dir > 0) (rtl ? next : prev)(); else (rtl ? prev : next)();
                 }, { enabled: !vertical && zoom <= 1 })}>
                {error ? (
                    <div className="rd-msg err">
                        <i className="bi bi-exclamation-triangle" /> {error}
                        {book.loadChapter && <button className="rd-btn rd-action" onClick={e => { e.stopPropagation(); setRetry(n => n + 1); }}>Повторить</button>}
                    </div>
                ) : !pages ? (
                    <div className="rd-msg"><i className="bi bi-arrow-repeat spin" /> Загружаю главу…</div>
                ) : vertical ? (
                    <div className="rd-column" style={{ width: `min(100%, ${Math.round(prefs.verticalWidth * zoom)}px)`, gap: prefs.gap }}>
                        {pages.map((p, i) => {
                            const st = loadState.get(p.url);
                            return (
                                <div key={`${chapter.id}:${i}`} className={`rd-vpage ${st ? `is-${st}` : 'is-wait'}`}>
                                    <img key={reloadKey.get(p.url) || 0} ref={el => { imgRefs.current[i] = el; }}
                                         src={src(p)} alt="" loading={Math.abs(i - page) < 4 ? 'eager' : 'lazy'} draggable={false}
                                         style={p.w && p.h ? { aspectRatio: `${p.w} / ${p.h}` } : { minHeight: '60vh' }}
                                         onLoad={e => { if (!p.w) e.currentTarget.style.minHeight = ''; markLoad(p.url, 'ok'); }}
                                         onError={() => markLoad(p.url, 'err')} />
                                    {st !== 'ok' && (
                                        <div className="rd-page-wait">
                                            {st === 'err' ? (
                                                <>
                                                    <span><i className="bi bi-exclamation-triangle" /> Стр. {i + 1} не загрузилась</span>
                                                    <button className="rd-btn rd-action" onClick={e => { e.stopPropagation(); retryPage(p.url); }}>Повторить</button>
                                                </>
                                            ) : (
                                                <><i className="bi bi-arrow-repeat spin" /><span>Стр. {i + 1}</span></>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <div className="rd-endcard">
                            {nextChapter ? (
                                <button className="rd-next-ch" onClick={() => goChapter(ch + 1)}>
                                    Следующая глава: {nextChapter.title || `Глава ${ch + 2}`} <i className="bi bi-chevron-down" />
                                </button>
                            ) : <span>Конец</span>}
                        </div>
                    </div>
                ) : (
                    <div className="rd-spread" style={{ flexDirection: prefs.direction === 'rtl' ? 'row-reverse' : 'row' }}>
                        {spreadPages.map(i => (
                            <img key={`${chapter.id}:${i}:${reloadKey.get(pages[i].url) || 0}`} src={src(pages[i])} alt="" draggable={false}
                                 className={loadState.get(pages[i].url) === 'ok' ? '' : 'rd-img-wait'}
                                 style={mediaStyle(pages[i], spreadPages.length)} {...imgEvents(pages[i])} />
                        ))}
                    </div>
                )}
                {pages && !vertical && !error && (() => {
                    const waiting = spreadPages.filter(i => loadState.get(pages[i].url) !== 'ok');
                    if (!waiting.length) return null;
                    const failed = waiting.filter(i => loadState.get(pages[i].url) === 'err');
                    const label = spreadPages.length > 1 ? `${spreadPages[0] + 1}–${spreadPages[spreadPages.length - 1] + 1}` : `${spreadPages[0] + 1}`;
                    return (
                        <div className={`rd-paged-wait ${failed.length ? 'err' : ''}`}>
                            <div className="rd-paged-wait-card" onClick={e => e.stopPropagation()}>
                                <div className="rd-paged-wait-num">{label}<small> / {pages.length}</small></div>
                                {failed.length ? (
                                    <>
                                        <span><i className="bi bi-exclamation-triangle" /> Страница не загрузилась</span>
                                        <button className="rd-btn rd-action" onClick={() => failed.forEach(i => retryPage(pages[i].url))}>Повторить</button>
                                    </>
                                ) : (
                                    <span><i className="bi bi-arrow-repeat spin" /> Загрузка…</span>
                                )}
                            </div>
                        </div>
                    );
                })()}
                {atEnd && !vertical && (
                    <div className="rd-endcard overlay" onClick={e => e.stopPropagation()}>
                        <div className="rd-end-title">Конец</div>
                        <button className="rd-next-ch" onClick={onClose}>Закрыть</button>
                        <button className="rd-link" onClick={() => { setAtEnd(false); goChapter(0); setPage(0); }}>Сначала</button>
                    </div>
                )}
            </div>

            {thumbs && pages && (
                <div className="rd-thumbs" onClick={e => e.stopPropagation()}>
                    {pages.map((p, i) => (
                        <button key={i} className={`rd-thumb ${(vertical ? page === i : spreadPages.includes(i)) ? 'on' : ''}`}
                                onClick={() => { setAtEnd(false); setPage(i); if (vertical) scrollToPage(i); else stageRef.current?.scrollTo({ top: 0 }); }}>
                            <img src={cachedMediaUrl(p.thumb || p.url)} alt="" loading="lazy" />
                            <span>{i + 1}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Touch screens: a button to bring the bars back, and a one-time hint. */}
            {touch && !ui && (
                <button className="rd-fab" onClick={e => { e.stopPropagation(); clearTimeout(hideTimer.current); setUi(true); }} title="Меню">
                    <i className="bi bi-three-dots" />
                </button>
            )}
            {touch && hint && (
                <div className="rd-hint" onClick={e => { e.stopPropagation(); dismissHint(); }}>
                    <div className="rd-hint-zones">
                        <span>{prefs.direction === 'rtl' && !vertical ? 'дальше' : 'назад'}</span>
                        <span>меню</span>
                        <span>{prefs.direction === 'rtl' && !vertical ? 'назад' : 'дальше'}</span>
                    </div>
                    <p>{vertical ? 'Лента: листайте пальцем вверх-вниз.' : 'Касание по краю или свайп — листать.'} Касание по центру — меню.</p>
                    <button className="rd-btn rd-action">Понятно</button>
                </div>
            )}

            <div className="rd-bottom">
                {pages && pages.length > 1 && (
                    <input className="rd-slider" type="range" min={0} max={pages.length - 1} value={page}
                           style={{ direction: prefs.direction === 'rtl' && !vertical ? 'rtl' : 'ltr' }}
                           onChange={e => { const i = Number(e.target.value); setAtEnd(false); setPage(i); if (vertical) scrollToPage(i); }}
                           onPointerUp={e => e.currentTarget.blur()} />
                )}
                {jump != null ? (
                    <input className="rd-jump" autoFocus value={jump} onChange={e => setJump(e.target.value)}
                           onBlur={() => setJump(null)}
                           onKeyDown={e => {
                               if (e.key === 'Enter') {
                                   const i = Math.min((pages?.length || 1), Math.max(1, Number(jump) || 1)) - 1;
                                   setPage(i); if (vertical) scrollToPage(i); setJump(null);
                               }
                           }} />
                ) : (
                    <button className="rd-count" onClick={() => setJump(String(page + 1))} title="Перейти к странице">
                        {(spreadPages[0] ?? page) + 1}{spreadPages.length > 1 ? `–${spreadPages[spreadPages.length - 1] + 1}` : ''} / {pages?.length || '…'}
                        {chapters.length > 1 && <span className="rd-count-all"> · всего {pos}/{total}</span>}
                    </button>
                )}
            </div>
        </div>,
        document.body,
    );
};

// Mounted once; openReader(book) shows it.
const MangaReader = () => {
    const [book, setBook] = useState(null);
    useEffect(() => registerReader((b) => setBook({ ...b })), []);
    if (!book) return null;
    return <ReaderView key={book.key} book={book} onClose={() => { setBook(null); book.onClose?.(); }} />;
};

export default MangaReader;
