const sharp = require('sharp');

// Perceptual hash (DCT pHash, 64 bits). Downscale to 32×32 greyscale, take the 8×8
// lowest DCT frequencies, and set a bit per coefficient above their median. Visually
// similar images (re-compressed, resized, lightly colour-shifted) end up a few bits
// apart. Pure sharp + JS — no Electron — so it can be tested from plain node.
//
// A mirrored copy hashes to something unrelated, so each image also gets the hash of
// its mirror image (`phashPair`); two images match if either pairing is close.

sharp.cache(false);   // never keep library files open/mapped between calls

const N = 32, K = 8;

// COS[u][x] = cos((2x+1)·u·π / 2N), only the K lowest frequencies are needed.
const COS = Array.from({ length: K }, (_, u) =>
    Float64Array.from({ length: N }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N))));

async function pixelsOf(buf) {
    const { data } = await sharp(buf, { failOn: 'none', pages: 1 })
        .rotate()                                   // honour EXIF orientation
        .greyscale()
        .resize(N, N, { fit: 'fill', kernel: 'cubic' })
        .raw()
        .toBuffer({ resolveWithObject: true });
    return data;
}

// pHash of N×N greyscale pixels.
function hashPixels(data) {
    // Separable 2-D DCT restricted to u, v < K.
    const rowT = new Float64Array(N * K);           // rowT[y*K + u] = Σx f(x,y)·C[u][x]
    for (let y = 0; y < N; y++) {
        for (let u = 0; u < K; u++) {
            let s = 0;
            const c = COS[u];
            for (let x = 0; x < N; x++) s += data[y * N + x] * c[x];
            rowT[y * K + u] = s;
        }
    }
    const coeffs = new Float64Array(K * K);         // F[v*K + u]
    for (let v = 0; v < K; v++) {
        const c = COS[v];
        for (let u = 0; u < K; u++) {
            let s = 0;
            for (let y = 0; y < N; y++) s += rowT[y * K + u] * c[y];
            coeffs[v * K + u] = s;
        }
    }

    // Median of the 63 AC coefficients (the DC term only encodes overall brightness).
    const ac = Array.from(coeffs.subarray(1)).sort((a, b) => a - b);
    const median = ac[Math.floor(ac.length / 2)];

    let hi = 0, lo = 0;
    for (let i = 0; i < 64; i++) {
        const bit = coeffs[i] > median ? 1 : 0;
        if (i < 32) hi = (hi << 1) | bit; else lo = (lo << 1) | bit;
    }
    return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
}

function mirrorPixels(data) {
    const out = Buffer.alloc(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[y * N + x] = data[y * N + (N - 1 - x)];
    return out;
}

/** 64-bit pHash of an image buffer as a 16-char hex string. */
async function phashOf(buf) {
    return hashPixels(await pixelsOf(buf));
}

/** pHash of an image and of its mirror image: { phash, mirror }. */
async function phashPair(buf) {
    const data = await pixelsOf(buf);
    return { phash: hashPixels(data), mirror: hashPixels(mirrorPixels(data)) };
}

function popcount32(v) {
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    return (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

const split = (hex) => [parseInt(hex.slice(0, 8), 16) >>> 0, parseInt(hex.slice(8, 16), 16) >>> 0];

/** Bits differing between two hex hashes. */
function hamming(a, b) {
    const [ah, al] = split(a), [bh, bl] = split(b);
    return popcount32(ah ^ bh) + popcount32(al ^ bl);
}

/**
 * Distance of `query` to an item: the plain pairing, or — when the item has a mirror
 * hash — the mirrored one if that's closer. { d, mirrored }.
 */
function pairDistance(query, phash, mirror) {
    const d = hamming(query, phash);
    if (!mirror) return { d, mirrored: false };
    const m = hamming(query, mirror);
    return m < d ? { d: m, mirrored: true } : { d, mirrored: false };
}

/**
 * Union-find grouping of `n` things linked pairwise by `link(i, j)` → score or null.
 * `closer(a, b)` says whether score a beats b. Returns groups (arrays of indices) of
 * 2+ along with each index's best score and partner. Yields to the event loop every
 * few rows so the main process stays responsive; `onProgress(pct)`.
 */
async function linkGroups(n, link, { closer = (a, b) => a < b, onProgress, rowsPerSlice = 150 } = {}) {
    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const best = new Array(n).fill(null);     // { score, partner, extra }
    const note = (i, j, r) => {
        if (!best[i] || closer(r.score, best[i].score)) best[i] = { score: r.score, partner: j, extra: r.extra };
    };
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const r = link(i, j);
            if (r == null) continue;
            const a = find(i), b = find(j);
            if (a !== b) parent[a] = b;
            note(i, j, r);
            note(j, i, r);
        }
        if (i % rowsPerSlice === 0) {
            onProgress?.(Math.round((1 - ((n - i) * (n - i)) / (n * n)) * 100));
            await new Promise(r => setImmediate(r));
        }
    }
    const groups = new Map();
    for (let i = 0; i < n; i++) {
        if (!best[i]) continue;
        const root = find(i);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(i);
    }
    return { groups: [...groups.values()].filter(g => g.length > 1), best };
}

/**
 * The same grouping from a ready list of linked pairs [{ i, j, score, extra }].
 */
function groupPairs(n, pairs, closer = (a, b) => a < b) {
    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const best = new Array(n).fill(null);
    const note = (i, j, p) => {
        if (!best[i] || closer(p.score, best[i].score)) best[i] = { score: p.score, partner: j, extra: p.extra };
    };
    for (const p of pairs) {
        const a = find(p.i), b = find(p.j);
        if (a !== b) parent[a] = b;
        note(p.i, p.j, p);
        note(p.j, p.i, p);
    }
    const groups = new Map();
    for (let i = 0; i < n; i++) {
        if (!best[i]) continue;
        const root = find(i);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(i);
    }
    return { groups: [...groups.values()].filter(g => g.length > 1), best };
}

/**
 * Group similar hashes. `entries` = [{ id, phash, mirror? }]; pairs within
 * `maxDistance` bits are linked (a mirrored pairing counts when both sides have a
 * mirror hash) and connected components returned as arrays of
 * { id, distance, mirrored } (distance to the closest partner).
 */
async function groupSimilar(entries, maxDistance, onProgress) {
    const n = entries.length;
    const hi = new Uint32Array(n), lo = new Uint32Array(n), mhi = new Uint32Array(n), mlo = new Uint32Array(n);
    const hasM = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        [hi[i], lo[i]] = split(entries[i].phash);
        if (entries[i].mirror) { [mhi[i], mlo[i]] = split(entries[i].mirror); hasM[i] = 1; }
    }
    const link = (i, j) => {
        const d = popcount32(hi[i] ^ hi[j]) + popcount32(lo[i] ^ lo[j]);
        if (d <= maxDistance) return { score: d, extra: false };
        if (hasM[i]) {
            const m = popcount32(mhi[i] ^ hi[j]) + popcount32(mlo[i] ^ lo[j]);
            if (m <= maxDistance) return { score: m, extra: true };
        }
        return null;
    };
    const { groups, best } = await linkGroups(n, link, { onProgress });
    return groups.map(g => g.map(i => ({ id: entries[i].id, distance: best[i].score, mirrored: best[i].extra })));
}

module.exports = { phashOf, phashPair, hashPixels, groupSimilar, linkGroups, groupPairs, popcount32, hamming, pairDistance };
