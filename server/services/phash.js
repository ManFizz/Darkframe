const sharp = require('sharp');

// Perceptual hash (DCT pHash, 64 bits). Downscale to 32×32 greyscale, take the 8×8
// lowest DCT frequencies, and set a bit per coefficient above their median. Visually
// similar images (re-compressed, resized, lightly colour-shifted) end up a few bits
// apart. Pure sharp + JS — no Electron — so it can be tested from plain node.

sharp.cache(false);   // never keep library files open/mapped between calls

const N = 32, K = 8;

// COS[u][x] = cos((2x+1)·u·π / 2N), only the K lowest frequencies are needed.
const COS = Array.from({ length: K }, (_, u) =>
    Float64Array.from({ length: N }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N))));

/** 64-bit pHash of an image buffer as a 16-char hex string. */
async function phashOf(buf) {
    const { data } = await sharp(buf, { failOn: 'none', pages: 1 })
        .rotate()                                   // honour EXIF orientation
        .greyscale()
        .resize(N, N, { fit: 'fill', kernel: 'cubic' })
        .raw()
        .toBuffer({ resolveWithObject: true });

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

function popcount32(v) {
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    return (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

/**
 * Group similar hashes. `entries` = [{ id, phash }]; pairs within `maxDistance` bits
 * are linked and connected components returned as arrays of { id, distance } (distance
 * to the component's closest partner). Runs in chunks and yields to the event loop so
 * the main process stays responsive on large libraries.
 */
async function groupSimilar(entries, maxDistance, onProgress) {
    const n = entries.length;
    const hi = new Uint32Array(n), lo = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
        hi[i] = parseInt(entries[i].phash.slice(0, 8), 16) >>> 0;
        lo[i] = parseInt(entries[i].phash.slice(8, 16), 16) >>> 0;
    }

    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const best = new Int16Array(n).fill(99);   // closest partner distance per item

    const ROWS_PER_SLICE = 150;
    for (let i = 0; i < n; i++) {
        const hi_i = hi[i], lo_i = lo[i];
        for (let j = i + 1; j < n; j++) {
            const d = popcount32(hi_i ^ hi[j]) + popcount32(lo_i ^ lo[j]);
            if (d <= maxDistance) {
                const a = find(i), b = find(j);
                if (a !== b) parent[a] = b;
                if (d < best[i]) best[i] = d;
                if (d < best[j]) best[j] = d;
            }
        }
        if (i % ROWS_PER_SLICE === 0) {
            onProgress?.(Math.round((1 - ((n - i) * (n - i)) / (n * n)) * 100));
            await new Promise(r => setImmediate(r));
        }
    }

    const groups = new Map();
    for (let i = 0; i < n; i++) {
        if (best[i] > maxDistance) continue;   // no partner at all
        const root = find(i);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push({ id: entries[i].id, distance: best[i] });
    }
    return [...groups.values()].filter(g => g.length > 1);
}

module.exports = { phashOf, groupSimilar, popcount32 };
