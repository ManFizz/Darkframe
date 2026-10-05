import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import LibraryService from '@services/LibraryService';
import {notify} from '@services/NotificationService';
import {appUrl} from '@/Infrastructure/electron';
import {saveEditPreset} from '@services/imageEditPreset';
import {NEUTRAL_COLOR, DEFAULT_OUTPUT, cssFilter, colorFactors, normalizeEditParams} from '@/shared/imageAdjust';

const GAMMA_FILTER_ID = 'df-ie-gamma';

const COLOR_SLIDERS = [
    ['brightness', 'Яркость'],
    ['contrast',   'Контраст'],
    ['saturation', 'Насыщенность'],
    ['gamma',      'Гамма'],
];

const FORMATS = [
    ['keep', 'Как есть'],
    ['jpeg', 'JPEG'],
    ['webp', 'WebP'],
];

const ASPECTS = [
    { label: 'Свободно', value: null },
    { label: '1:1',      value: 1 },
    { label: '4:3',      value: 4 / 3 },
    { label: '3:4',      value: 3 / 4 },
    { label: '16:9',     value: 16 / 9 },
    { label: '9:16',     value: 9 / 16 },
];

const MIN = 0.05;         // smallest crop side, as a fraction
const PAD = 40;           // stage padding around the fitted image
const ZOOM_MAX = 40;
const SNAP_RADIUS = 7;    // px (analysis space) to look for an edge
const SNAP_THRESHOLD = 22;// min average gradient to count as an edge
const GRID_MIN_PX = 7;    // draw the pixel grid once a pixel is at least this many screen px
const LOUPE_D = 150;      // loupe diameter, px
const LOUPE_PPX = 12;     // loupe screen-px per source pixel
const LOUPE_GAP = 22;     // offset from the cursor

const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

// Move the crop rect along with the image so selection survives rotate/flip.
const rotateCropCW  = (c) => ({ x: 1 - c.y - c.h, y: c.x,           w: c.h, h: c.w });
const rotateCropCCW = (c) => ({ x: c.y,           y: 1 - c.x - c.w, w: c.h, h: c.w });

// Saved parameters of the previous edit (edits are re-applied to the pristine source,
// so the editor starts from the source with these values pre-filled).
function savedParams(file) {
    if (!file.editParams) return null;
    try { return normalizeEditParams(JSON.parse(file.editParams)); }
    catch { return null; }
}

const ImageEditor = ({ file, onCancel, onSaved }) => {
    const saved = useMemo(() => savedParams(file), []);   // eslint-disable-line react-hooks/exhaustive-deps
    const initRot  = saved ? Math.round(saved.angle / 90) : 0;
    const initFine = saved ? clamp(saved.angle - initRot * 90, -45, 45) : 0;

    const [img, setImg]           = useState(null);
    const [rot90, setRot90]       = useState(initRot);
    const [fine, setFine]         = useState(initFine);
    const [flipH, setFlipH]       = useState(saved?.flipH ?? false);
    const [flipV, setFlipV]       = useState(saved?.flipV ?? false);
    const [aspect, setAspect]     = useState(null);
    const [crop, setCrop]         = useState(saved?.crop ?? { x: 0, y: 0, w: 1, h: 1 });
    const [color, setColor]       = useState(saved?.color ?? NEUTRAL_COLOR);
    const [output, setOutput]     = useState(saved?.output ?? DEFAULT_OUTPUT);
    const [panel, setPanel]       = useState(null);   // null | 'color' | 'export'
    const [stageSize, setStage]   = useState({ w: 0, h: 0 });
    const [zoom, setZoom]         = useState(1);
    const [offset, setOffset]     = useState({ x: 0, y: 0 });
    const [gridOn, setGridOn]     = useState(false);
    const [snapOn, setSnapOn]     = useState(false);
    const [loupeOn, setLoupeOn]   = useState(false);
    const [loupePos, setLoupePos] = useState(null);   // {cx,cy} relative to stage, or null
    const [saving, setSaving]     = useState(false);

    const stageRef  = useRef(null);
    const canvasRef = useRef(null);
    const loupeRef  = useRef(null);
    const dragRef   = useRef(null);
    const panRef    = useRef(null);
    const colEdgeRef = useRef(null);   // per-column vertical-edge strength
    const rowEdgeRef = useRef(null);   // per-row horizontal-edge strength

    const angle = rot90 * 90 + fine;
    // Gamma has no CSS filter function → an SVG feComponentTransfer referenced by id.
    // The id carries the value so the canvas never reuses a cached filter.
    const gammaId = `${GAMMA_FILTER_ID}-${Math.round(Number(color.gamma) || 0) + 100}`;
    const previewFilter = cssFilter(color, `#${gammaId}`);
    const gammaExp = 1 / colorFactors(color).g;

    // ─── Load image + measure the stage ────────────────────────────────────────
    // Edit from the pristine source (library://source → base/source/original). Items
    // edited the old cumulative way (no stored params) start from their current look,
    // which the server then keeps as their baseline.
    useEffect(() => {
        const legacy = !!file.editedAt && !file.editParams;
        const im = new window.Image();
        im.onload = () => setImg(im);
        im.src = legacy ? file.getUrl() : appUrl(`library://source/${file.id}?v=${file.editedAt || 0}`);
    }, [file]);

    useLayoutEffect(() => {
        if (!stageRef.current) return;
        const measure = () => {
            const r = stageRef.current.getBoundingClientRect();
            setStage({ w: r.width, h: r.height });
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(stageRef.current);
        return () => ro.disconnect();
    }, []);

    // Rotated bounding box for the current angle.
    const layout = useMemo(() => {
        if (!img) return null;
        const rad = angle * Math.PI / 180;
        const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
        return {
            rad,
            RW: img.naturalWidth * cos + img.naturalHeight * sin,
            RH: img.naturalWidth * sin + img.naturalHeight * cos,
        };
    }, [img, angle]);

    // Current on-screen placement of the rotated image box.
    const view = useMemo(() => {
        if (!layout || !stageSize.w) return null;
        const bf = Math.min((stageSize.w - PAD) / layout.RW, (stageSize.h - PAD) / layout.RH);
        const drawScale = bf * zoom;
        const boxW = layout.RW * drawScale, boxH = layout.RH * drawScale;
        const origin = { x: (stageSize.w - boxW) / 2 + offset.x, y: (stageSize.h - boxH) / 2 + offset.y };
        return { bf, drawScale, boxW, boxH, origin };
    }, [layout, stageSize, zoom, offset]);

    // ─── Draw the canvas (viewport-sized; whole image drawn, clipped) ───────────
    useLayoutEffect(() => {
        if (!img || !layout || !view || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = Math.max(1, Math.round(stageSize.w));
        canvas.height = Math.max(1, Math.round(stageSize.h));

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = view.drawScale < 1;   // crisp pixels when zoomed in
        ctx.imageSmoothingQuality = 'high';

        // Colour preview: the same CSS filter maths the server applies to the pixels.
        // The black backing (sharp's JPEG corner fill) is filtered too, like on save.
        ctx.save();
        ctx.filter = previewFilter;
        ctx.fillStyle = '#000';
        ctx.fillRect(view.origin.x, view.origin.y, view.boxW, view.boxH);

        ctx.translate(view.origin.x + view.boxW / 2, view.origin.y + view.boxH / 2);
        ctx.rotate(layout.rad);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        const dw = img.naturalWidth * view.drawScale, dh = img.naturalHeight * view.drawScale;
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();

        // Pixel grid.
        if (gridOn && view.drawScale >= GRID_MIN_PX) {
            const step = view.drawScale;
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const x0 = Math.max(view.origin.x, 0), x1 = Math.min(view.origin.x + view.boxW, canvas.width);
            const y0 = Math.max(view.origin.y, 0), y1 = Math.min(view.origin.y + view.boxH, canvas.height);
            for (let gx = view.origin.x + Math.ceil((x0 - view.origin.x) / step) * step; gx <= x1; gx += step) {
                ctx.moveTo(Math.round(gx) + 0.5, y0); ctx.lineTo(Math.round(gx) + 0.5, y1);
            }
            for (let gy = view.origin.y + Math.ceil((y0 - view.origin.y) / step) * step; gy <= y1; gy += step) {
                ctx.moveTo(x0, Math.round(gy) + 0.5); ctx.lineTo(x1, Math.round(gy) + 0.5);
            }
            ctx.stroke();
        }
    }, [img, layout, view, flipH, flipV, gridOn, stageSize, previewFilter, gammaExp]);

    // ─── Edge analysis for magnetic snapping ───────────────────────────────────
    // Uses the discrete (90°) orientation only — the straighten slider is ignored so
    // we don't rebuild the edge map on every tick; small angles snap close enough.
    useEffect(() => {
        if (!img || !snapOn) { colEdgeRef.current = null; rowEdgeRef.current = null; return; }
        const quarter = ((rot90 % 4) + 4) % 4;
        const rad = quarter * Math.PI / 2;
        const swap = quarter % 2 === 1;
        const RW = swap ? img.naturalHeight : img.naturalWidth;
        const RH = swap ? img.naturalWidth : img.naturalHeight;

        const maxSide = 1400;
        const aScale = Math.min(maxSide / RW, maxSide / RH, 1);
        const aw = Math.max(2, Math.round(RW * aScale));
        const ah = Math.max(2, Math.round(RH * aScale));

        const oc = document.createElement('canvas');
        oc.width = aw; oc.height = ah;
        const octx = oc.getContext('2d', { willReadFrequently: true });
        octx.fillStyle = '#000';
        octx.fillRect(0, 0, aw, ah);
        octx.save();
        octx.translate(aw / 2, ah / 2);
        octx.rotate(rad);
        octx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        const dw = img.naturalWidth * aScale, dh = img.naturalHeight * aScale;
        octx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        octx.restore();

        const data = octx.getImageData(0, 0, aw, ah).data;
        const gray = new Float32Array(aw * ah);
        for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
            gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        }
        // Average gradient per column / row → favours long, straight boundaries.
        const colEdge = new Float32Array(aw), rowEdge = new Float32Array(ah);
        for (let x = 1; x < aw - 1; x++) {
            let s = 0;
            for (let y = 0; y < ah; y++) s += Math.abs(gray[y * aw + x + 1] - gray[y * aw + x - 1]);
            colEdge[x] = s / ah;
        }
        for (let y = 1; y < ah - 1; y++) {
            let s = 0;
            for (let x = 0; x < aw; x++) s += Math.abs(gray[(y + 1) * aw + x] - gray[(y - 1) * aw + x]);
            rowEdge[y] = s / aw;
        }
        colEdgeRef.current = colEdge;
        rowEdgeRef.current = rowEdge;
        // fine is intentionally excluded (perf) — analysis uses the last discrete geometry.
    }, [img, snapOn, layout, rot90, flipH, flipV]);   // eslint-disable-line

    const snapFrac = (frac, edgeArr) => {
        if (!edgeArr) return frac;
        const N = edgeArr.length;
        let idx = clamp(Math.round(frac * (N - 1)), 0, N - 1);
        let best = idx, bestV = edgeArr[idx];
        for (let d = 1; d <= SNAP_RADIUS; d++) {
            if (idx - d >= 0 && edgeArr[idx - d] > bestV) { bestV = edgeArr[idx - d]; best = idx - d; }
            if (idx + d < N  && edgeArr[idx + d] > bestV) { bestV = edgeArr[idx + d]; best = idx + d; }
        }
        return bestV >= SNAP_THRESHOLD ? best / (N - 1) : frac;
    };

    // ─── Loupe: follow the cursor over the stage ───────────────────────────────
    useEffect(() => {
        if (!loupeOn) { setLoupePos(null); return; }
        const onMove = (e) => {
            const el = stageRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const cx = e.clientX - r.left, cy = e.clientY - r.top;
            if (cx < 0 || cy < 0 || cx > r.width || cy > r.height) setLoupePos(null);
            else setLoupePos({ cx, cy });
        };
        window.addEventListener('pointermove', onMove);
        return () => window.removeEventListener('pointermove', onMove);
    }, [loupeOn]);

    // Draw the magnified circle: true source pixels, grid, and the crop boundary.
    useEffect(() => {
        const canvas = loupeRef.current;
        if (!canvas || !loupePos || !view || !img || !layout) return;
        canvas.width = LOUPE_D; canvas.height = LOUPE_D;
        const ctx = canvas.getContext('2d');
        const { RW, RH } = layout;
        const s = LOUPE_PPX;

        // While dragging a handle, focus the loupe on the crop edge/corner being moved
        // (so the crosshair sits exactly on the cut line) — otherwise on the cursor.
        const drag = dragRef.current;
        let Px, Py;
        if (drag && drag.mode !== 'move') {
            const fx = drag.mode.includes('w') ? crop.x : drag.mode.includes('e') ? crop.x + crop.w : crop.x + crop.w / 2;
            const fy = drag.mode.includes('n') ? crop.y : drag.mode.includes('s') ? crop.y + crop.h : crop.y + crop.h / 2;
            Px = fx * RW; Py = fy * RH;
        } else {
            Px = ((loupePos.cx - view.origin.x) / view.boxW) * RW;
            Py = ((loupePos.cy - view.origin.y) / view.boxH) * RH;
        }
        const ox = LOUPE_D / 2 - Px * s;   // top-left of the rotated box in loupe coords
        const oy = LOUPE_D / 2 - Py * s;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, LOUPE_D, LOUPE_D);
        ctx.imageSmoothingEnabled = false;
        ctx.save();
        ctx.filter = previewFilter;
        ctx.translate(ox + RW * s / 2, oy + RH * s / 2);
        ctx.rotate(layout.rad);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        ctx.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2, img.naturalWidth * s, img.naturalHeight * s);
        ctx.restore();

        // Pixel grid.
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = ((ox % s) + s) % s; gx <= LOUPE_D; gx += s) { ctx.moveTo(Math.round(gx) + 0.5, 0); ctx.lineTo(Math.round(gx) + 0.5, LOUPE_D); }
        for (let gy = ((oy % s) + s) % s; gy <= LOUPE_D; gy += s) { ctx.moveTo(0, Math.round(gy) + 0.5); ctx.lineTo(LOUPE_D, Math.round(gy) + 0.5); }
        ctx.stroke();

        // Dim the part that would be cropped away, outline the crop edge.
        const cl = ox + crop.x * RW * s, ctp = oy + crop.y * RH * s;
        const cw = crop.w * RW * s,       chh = crop.h * RH * s;
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.beginPath();
        ctx.rect(0, 0, LOUPE_D, LOUPE_D);
        ctx.rect(cl, ctp, cw, chh);
        ctx.fill('evenodd');
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--df-accent').trim() || '#b06bff';
        ctx.lineWidth = 2;
        ctx.strokeRect(cl, ctp, cw, chh);

        // Centre crosshair.
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(LOUPE_D / 2 - 6, LOUPE_D / 2); ctx.lineTo(LOUPE_D / 2 + 6, LOUPE_D / 2);
        ctx.moveTo(LOUPE_D / 2, LOUPE_D / 2 - 6); ctx.lineTo(LOUPE_D / 2, LOUPE_D / 2 + 6);
        ctx.stroke();
    }, [loupePos, view, img, layout, crop, flipH, flipV, previewFilter, gammaExp]);

    // ─── Aspect / rotate / flip ────────────────────────────────────────────────
    const axisSwapped = (((rot90 % 2) + 2) % 2) === 1;
    const rotateLeft  = () => { setCrop(rotateCropCCW); setRot90(r => r - 1); setAspect(null); setZoom(1); setOffset({ x: 0, y: 0 }); };
    const rotateRight = () => { setCrop(rotateCropCW);  setRot90(r => r + 1); setAspect(null); setZoom(1); setOffset({ x: 0, y: 0 }); };
    const doFlipH     = () => { setCrop(c => (axisSwapped ? { ...c, y: 1 - c.y - c.h } : { ...c, x: 1 - c.x - c.w })); setFlipH(v => !v); };
    const doFlipV     = () => { setCrop(c => (axisSwapped ? { ...c, x: 1 - c.x - c.w } : { ...c, y: 1 - c.y - c.h })); setFlipV(v => !v); };

    const applyAspect = useCallback((ratio) => {
        setAspect(ratio);
        if (!ratio || !view) return;                    // "Свободно": keep current selection
        let wf = 1, hf = (view.boxW / ratio) / view.boxH;
        if (hf > 1) { hf = 1; wf = (view.boxH * ratio) / view.boxW; }
        setCrop({ x: (1 - wf) / 2, y: (1 - hf) / 2, w: wf, h: hf });
    }, [view]);

    // ─── Crop drag / resize ─────────────────────────────────────────────────────
    const onPointerMove = useCallback((e) => {
        const d = dragRef.current;
        if (!d) return;
        const dfx = (e.clientX - d.sx) / d.boxW;
        const dfy = (e.clientY - d.sy) / d.boxH;
        let { x, y, w, h } = d.crop;

        if (d.mode === 'move') {
            setCrop({ x: clamp(x + dfx, 0, 1 - w), y: clamp(y + dfy, 0, 1 - h), w, h });
            return;
        }

        let l = x, r = x + w, t = y, b = y + h;
        if (d.mode.includes('w')) l = clamp(l + dfx, 0, r - MIN);
        if (d.mode.includes('e')) r = clamp(r + dfx, l + MIN, 1);
        if (d.mode.includes('n')) t = clamp(t + dfy, 0, b - MIN);
        if (d.mode.includes('s')) b = clamp(b + dfy, t + MIN, 1);

        // Magnetic snap to strong edges (only on the moved sides, only when free-form).
        if (d.snap && !d.aspect) {
            if (d.mode.includes('w')) l = clamp(snapFrac(l, colEdgeRef.current), 0, r - MIN);
            if (d.mode.includes('e')) r = clamp(snapFrac(r, colEdgeRef.current), l + MIN, 1);
            if (d.mode.includes('n')) t = clamp(snapFrac(t, rowEdgeRef.current), 0, b - MIN);
            if (d.mode.includes('s')) b = clamp(snapFrac(b, rowEdgeRef.current), t + MIN, 1);
        }

        let nx = l, ny = t, nw = r - l, nh = b - t;

        // Aspect lock on corner handles (overrides snapping).
        if (d.aspect && d.mode.length === 2) {
            let nhA = clamp(((nw * d.boxW) / d.aspect) / d.boxH, MIN, 1);
            if (d.mode.includes('n')) ny = b - nhA;
            if (ny < 0) ny = 0;
            if (ny + nhA > 1) nhA = 1 - ny;
            nh = nhA;
        }
        setCrop({ x: nx, y: ny, w: nw, h: nh });
    }, []);

    const onPointerUp = useCallback(() => {
        dragRef.current = null;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
    }, [onPointerMove]);

    const startCropDrag = useCallback((e, mode) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { mode, sx: e.clientX, sy: e.clientY, crop, aspect, snap: snapOn, boxW: view.boxW, boxH: view.boxH };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);   // a touch the system took over
    }, [crop, aspect, snapOn, view, onPointerMove, onPointerUp]);

    // ─── Pan (drag background) + zoom (wheel) ───────────────────────────────────
    const onPanMove = useCallback((e) => {
        const p = panRef.current;
        if (!p) return;
        setOffset({ x: p.ox + (e.clientX - p.sx), y: p.oy + (e.clientY - p.sy) });
    }, []);
    const onPanUp = useCallback(() => {
        panRef.current = null;
        window.removeEventListener('pointermove', onPanMove);
        window.removeEventListener('pointerup', onPanUp);
    }, [onPanMove]);
    const startPan = useCallback((e) => {
        if (zoom <= 1) return;
        panRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
        window.addEventListener('pointermove', onPanMove);
        window.addEventListener('pointerup', onPanUp);
    }, [zoom, offset, onPanMove, onPanUp]);

    const onWheel = useCallback((e) => {
        if (!view || !stageRef.current) return;
        e.preventDefault();   // needs a non-passive native listener (see effect below)
        const rect = stageRef.current.getBoundingClientRect();
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
        const z2 = clamp(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, ZOOM_MAX);
        if (z2 === zoom) return;
        // Keep the point under the cursor fixed.
        const fx = (cx - view.origin.x) / view.boxW;
        const fy = (cy - view.origin.y) / view.boxH;
        const boxW2 = layout.RW * view.bf * z2, boxH2 = layout.RH * view.bf * z2;
        const cen2x = (stageSize.w - boxW2) / 2, cen2y = (stageSize.h - boxH2) / 2;
        setZoom(z2);
        setOffset(z2 === 1 ? { x: 0, y: 0 } : { x: (cx - fx * boxW2) - cen2x, y: (cy - fy * boxH2) - cen2y });
    }, [view, zoom, layout, stageSize]);

    const resetZoom = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };

    // Wheel must be a non-passive native listener so preventDefault stops the modal scroll.
    useEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [onWheel]);

    // ─── Cleanup + Escape ──────────────────────────────────────────────────────
    useEffect(() => () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointermove', onPanMove);
        window.removeEventListener('pointerup', onPanUp);
    }, [onPointerMove, onPointerUp, onPanMove, onPanUp]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onCancel]);

    // ─── Save / revert ─────────────────────────────────────────────────────────
    const handleSave = async () => {
        setSaving(true);
        try {
            // The full edit — applied to the pristine source, so it replaces (not
            // stacks on) whatever was saved before.
            const params = { angle, flipH, flipV, crop, color, output };
            await LibraryService.editImage(file.id, params);
            saveEditPreset(params);   // remember for one-click re-apply / batch
            notify({ message: 'Изменения сохранены', type: 'success' });
            onSaved();
        } catch (e) {
            notify({ message: `Не удалось сохранить: ${e.message}`, type: 'danger' });
            setSaving(false);
        }
    };
    const handleRevert = async () => {
        if (!confirm('Вернуть оригинал? Все правки будут отменены.')) return;
        setSaving(true);
        try {
            await LibraryService.revertImage(file.id);
            notify({ message: 'Оригинал восстановлен', type: 'success' });
            onSaved();
        } catch (e) {
            notify({ message: `Не удалось восстановить: ${e.message}`, type: 'danger' });
            setSaving(false);
        }
    };

    // Resulting pixel size (crop of the rotated box, then the optional max side).
    const outSize = (() => {
        if (!layout) return null;
        let w = Math.max(1, Math.round(crop.w * layout.RW));
        let h = Math.max(1, Math.round(crop.h * layout.RH));
        const m = output.maxSide;
        if (m && Math.max(w, h) > m) {
            const k = m / Math.max(w, h);
            w = Math.round(w * k); h = Math.round(h * k);
        }
        return { w, h };
    })();
    const srcIsLossy = /jpe?g|webp/i.test(file.mimeType || '');
    const qualityApplies = output.format !== 'keep' || srcIsLossy;
    const colorTouched = COLOR_SLIDERS.some(([k]) => Number(color[k]));
    const exportTouched = output.format !== 'keep' || !!output.maxSide;

    const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const cropStyle = view ? {
        left:   view.origin.x + crop.x * view.boxW,
        top:    view.origin.y + crop.y * view.boxH,
        width:  crop.w * view.boxW,
        height: crop.h * view.boxH,
    } : { display: 'none' };

    return (
        <div className="img-editor" onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
            {/* Gamma for the canvas preview (sRGB, like the server-side LUT). */}
            <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
                <filter id={gammaId} colorInterpolationFilters="sRGB">
                    <feComponentTransfer>
                        <feFuncR type="gamma" amplitude="1" exponent={gammaExp} offset="0" />
                        <feFuncG type="gamma" amplitude="1" exponent={gammaExp} offset="0" />
                        <feFuncB type="gamma" amplitude="1" exponent={gammaExp} offset="0" />
                    </feComponentTransfer>
                </filter>
            </svg>

            <div
                className={`img-editor-stage ${zoom > 1 ? 'pannable' : ''}`}
                ref={stageRef}
                onPointerDown={startPan}
            >
                <canvas ref={canvasRef} className="img-editor-canvas" />
                <div className="img-editor-crop" style={cropStyle} onPointerDown={e => startCropDrag(e, 'move')}>
                    <span className="img-editor-guides" />
                    {HANDLES.map(h => (
                        <span key={h} className={`img-editor-handle h-${h}`} onPointerDown={e => startCropDrag(e, h)} />
                    ))}
                </div>
                {loupeOn && loupePos && view && (() => {
                    let lx = loupePos.cx + LOUPE_GAP, ly = loupePos.cy - LOUPE_D - LOUPE_GAP;
                    if (ly < 0) ly = loupePos.cy + LOUPE_GAP;
                    if (lx + LOUPE_D > stageSize.w) lx = loupePos.cx - LOUPE_D - LOUPE_GAP;
                    return (
                        <div className="img-editor-loupe" style={{ left: lx, top: ly, width: LOUPE_D, height: LOUPE_D }}>
                            <canvas ref={loupeRef} />
                        </div>
                    );
                })()}

                {zoom > 1 && (
                    <div className="img-editor-zoom-badge">
                        {Math.round(zoom * 100)}%
                        <button className="ie-zoom-reset" title="Сбросить масштаб" onClick={resetZoom}>
                            <i className="bi bi-arrows-angle-contract" />
                        </button>
                    </div>
                )}

                {panel === 'color' && (
                    <div className="ie-panel" onPointerDown={e => e.stopPropagation()}>
                        <div className="ie-panel-head">
                            <span><i className="bi bi-palette" /> Цвет</span>
                            {colorTouched && (
                                <button className="ie-panel-link" onClick={() => setColor(NEUTRAL_COLOR)}>Сбросить</button>
                            )}
                        </div>
                        {COLOR_SLIDERS.map(([key, label]) => (
                            <label className="ie-slider" key={key} title="Двойной клик — сбросить">
                                <span>{label}</span>
                                <input
                                    type="range" min={-100} max={100} step={1}
                                    value={color[key]}
                                    onChange={e => setColor(c => ({ ...c, [key]: Number(e.target.value) }))}
                                    onDoubleClick={() => setColor(c => ({ ...c, [key]: 0 }))}
                                />
                                <b>{color[key] > 0 ? `+${color[key]}` : color[key]}</b>
                            </label>
                        ))}
                    </div>
                )}

                {panel === 'export' && (
                    <div className="ie-panel" onPointerDown={e => e.stopPropagation()}>
                        <div className="ie-panel-head">
                            <span><i className="bi bi-file-earmark-zip" /> Экспорт и сжатие</span>
                            {exportTouched && (
                                <button className="ie-panel-link" onClick={() => setOutput(DEFAULT_OUTPUT)}>Сбросить</button>
                            )}
                        </div>
                        <div className="ie-seg">
                            {FORMATS.map(([id, label]) => (
                                <button
                                    key={id}
                                    className={output.format === id ? 'on' : ''}
                                    onClick={() => setOutput(o => ({ ...o, format: id }))}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        {qualityApplies && (
                            <label className="ie-slider">
                                <span>Качество</span>
                                <input
                                    type="range" min={30} max={100} step={1}
                                    value={output.quality}
                                    onChange={e => setOutput(o => ({ ...o, quality: Number(e.target.value) }))}
                                />
                                <b>{output.quality}</b>
                            </label>
                        )}
                        <label className="ie-field">
                            <span>Макс. сторона</span>
                            <input
                                type="number" min={16} step={1}
                                placeholder="без изменений"
                                value={output.maxSide ?? ''}
                                onChange={e => {
                                    const v = e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value)));
                                    setOutput(o => ({ ...o, maxSide: v || null }));
                                }}
                            />
                            <em>px</em>
                        </label>
                        {outSize && (
                            <div className="ie-panel-hint">
                                Итог: {outSize.w}×{outSize.h}
                                {output.format !== 'keep' && <> · {output.format === 'jpeg' ? 'JPEG' : 'WebP'}</>}
                                {output.format === 'jpeg' && !srcIsLossy && <> · прозрачность станет белой</>}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="img-editor-toolbar">
                <div className="img-editor-group">
                    <button className="ie-btn" title="Повернуть влево" onClick={rotateLeft}><i className="bi bi-arrow-counterclockwise" /></button>
                    <button className="ie-btn" title="Повернуть вправо" onClick={rotateRight}><i className="bi bi-arrow-clockwise" /></button>
                    <button className={`ie-btn ${flipH ? 'on' : ''}`} title="Отразить по горизонтали" onClick={doFlipH}><i className="bi bi-symmetry-vertical" /></button>
                    <button className={`ie-btn ${flipV ? 'on' : ''}`} title="Отразить по вертикали" onClick={doFlipV}><i className="bi bi-symmetry-horizontal" /></button>
                </div>

                <label className="img-editor-straighten" title="Выровнять горизонт">
                    <input type="range" min={-45} max={45} step={1} value={fine} onChange={e => setFine(Number(e.target.value))} />
                    <b>{fine > 0 ? `+${fine}` : fine}°</b>
                </label>

                <div className="img-editor-group img-editor-aspects">
                    {ASPECTS.map(a => (
                        <button key={a.label} className={`ie-chip ${aspect === a.value ? 'on' : ''}`} onClick={() => applyAspect(a.value)}>
                            {a.label}
                        </button>
                    ))}
                </div>

                {/* Toggles */}
                <div className="img-editor-group">
                    <button className={`ie-btn ${gridOn ? 'on' : ''}`} title="Пиксельная сетка (зум колесом)" onClick={() => setGridOn(v => !v)}>
                        <i className="bi bi-grid-3x3" />
                    </button>
                    <button className={`ie-btn ${snapOn ? 'on' : ''}`} title="Привязка к краям" onClick={() => setSnapOn(v => !v)}>
                        <i className="bi bi-magnet" />
                    </button>
                    <button className={`ie-btn ${loupeOn ? 'on' : ''}`} title="Лупа (пиксели под курсором)" onClick={() => setLoupeOn(v => !v)}>
                        <i className="bi bi-search" />
                    </button>
                </div>

                {/* Colour / export panels */}
                <div className="img-editor-group">
                    <button
                        className={`ie-btn ${panel === 'color' ? 'on' : ''} ${colorTouched ? 'dot' : ''}`}
                        title="Цвет: яркость, контраст, насыщенность, гамма"
                        onClick={() => setPanel(p => (p === 'color' ? null : 'color'))}
                    >
                        <i className="bi bi-palette" />
                    </button>
                    <button
                        className={`ie-btn ${panel === 'export' ? 'on' : ''} ${exportTouched ? 'dot' : ''}`}
                        title="Экспорт и сжатие: формат, качество, размер"
                        onClick={() => setPanel(p => (p === 'export' ? null : 'export'))}
                    >
                        <i className="bi bi-file-earmark-zip" />
                    </button>
                </div>

                <div className="img-editor-actions">
                    {file.editedAt && (
                        <button className="ie-btn-text ie-revert" onClick={handleRevert} disabled={saving}>
                            <i className="bi bi-arrow-90deg-left me-1" />Оригинал
                        </button>
                    )}
                    <button className="ie-btn-text" onClick={onCancel} disabled={saving}>Отмена</button>
                    <button className="ie-btn-text ie-save" onClick={handleSave} disabled={saving || !img}>
                        {saving ? <i className="bi bi-arrow-repeat spin" /> : <><i className="bi bi-check-lg me-1" />Сохранить</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImageEditor;
