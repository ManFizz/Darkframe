// Image edit parameters + colour math, shared by the editor preview (renderer, via CSS
// canvas filters) and the saved result (main process, on raw pixels). The pixel math
// follows the CSS Filter Effects definitions in sRGB, clamping after every step, so
// what the canvas shows is what gets written. CommonJS: used by node and webpack.

const NEUTRAL_COLOR  = { brightness: 0, contrast: 0, saturation: 0, gamma: 0 };   // sliders, -100..100
const DEFAULT_OUTPUT = { format: 'keep', quality: 92, maxSide: null };            // 'keep' | 'jpeg' | 'webp'

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d) => (isFinite(Number(v)) ? Number(v) : d);

// Slider units → CSS filter factors.
function colorFactors(c = NEUTRAL_COLOR) {
    return {
        b: 1 + clampN(num(c.brightness, 0), -100, 100) / 100,          // brightness(0..2)
        c: 1 + clampN(num(c.contrast, 0), -100, 100) / 100,            // contrast(0..2)
        s: 1 + clampN(num(c.saturation, 0), -100, 100) / 100,          // saturate(0..2)
        g: Math.pow(2, clampN(num(c.gamma, 0), -100, 100) / 50),       // gamma 0.25..4 (>1 brightens mids)
    };
}

function isNeutralColor(c) {
    return !c || ['brightness', 'contrast', 'saturation', 'gamma'].every(k => !num(c[k], 0));
}

// Fill defaults / coerce (older presets only carry geometry).
function normalizeEditParams(p = {}) {
    const crop = p.crop || {};
    return {
        angle: num(p.angle, 0),
        flipH: !!p.flipH,
        flipV: !!p.flipV,
        crop: {
            x: clampN(num(crop.x, 0), 0, 1),
            y: clampN(num(crop.y, 0), 0, 1),
            w: clampN(num(crop.w, 1), 0, 1),
            h: clampN(num(crop.h, 1), 0, 1),
        },
        color: { ...NEUTRAL_COLOR, ...(p.color || {}) },
        output: {
            format:  ['keep', 'jpeg', 'webp'].includes(p.output?.format) ? p.output.format : 'keep',
            quality: clampN(Math.round(num(p.output?.quality, DEFAULT_OUTPUT.quality)), 30, 100),
            maxSide: p.output?.maxSide ? Math.max(16, Math.round(num(p.output.maxSide, 0))) : null,
        },
    };
}

// CSS string for a canvas preview: brightness → contrast → saturate (gamma is an SVG
// feComponentTransfer referenced by id, appended by the caller when not neutral).
function cssFilter(c, gammaFilterUrl) {
    const f = colorFactors(c);
    const parts = [];
    if (f.b !== 1) parts.push(`brightness(${f.b})`);
    if (f.c !== 1) parts.push(`contrast(${f.c})`);
    if (f.s !== 1) parts.push(`saturate(${f.s})`);
    if (f.g !== 1 && gammaFilterUrl) parts.push(`url(${gammaFilterUrl})`);
    return parts.length ? parts.join(' ') : 'none';
}

/**
 * Apply the colour adjustments in place to 8-bit raw pixels (RGB or RGBA; alpha kept).
 * Same order and clamping as the CSS preview.
 */
function applyColorToRaw(data, channels, color) {
    if (isNeutralColor(color)) return data;
    const f = colorFactors(color);

    // brightness + contrast are per-channel → one float LUT
    const bc = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
        let v = clampN((i / 255) * f.b, 0, 1);
        v = clampN((v - 0.5) * f.c + 0.5, 0, 1);
        bc[i] = v;
    }
    // gamma on the (re-quantized) result → byte LUT
    const gl = new Uint8Array(256);
    for (let i = 0; i < 256; i++) gl[i] = Math.round(Math.pow(i / 255, 1 / f.g) * 255);

    const s = f.s, sat = s !== 1;
    // CSS saturate() matrix
    const m = [
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
    ];

    for (let i = 0; i < data.length; i += channels) {
        let r = bc[data[i]], g = bc[data[i + 1]], b = bc[data[i + 2]];
        if (sat) {
            const nr = m[0] * r + m[1] * g + m[2] * b;
            const ng = m[3] * r + m[4] * g + m[5] * b;
            const nb = m[6] * r + m[7] * g + m[8] * b;
            r = clampN(nr, 0, 1); g = clampN(ng, 0, 1); b = clampN(nb, 0, 1);
        }
        data[i]     = gl[Math.round(r * 255)];
        data[i + 1] = gl[Math.round(g * 255)];
        data[i + 2] = gl[Math.round(b * 255)];
    }
    return data;
}

module.exports = {
    NEUTRAL_COLOR, DEFAULT_OUTPUT,
    colorFactors, isNeutralColor, normalizeEditParams, cssFilter, applyColorToRaw,
};
