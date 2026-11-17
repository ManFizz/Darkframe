const { QueryTypes } = require('sequelize');
const sequelize = require('../database');
require('../models/associations');
const autotag = require('./autotag');
const { linkGroups, groupPairs, popcount32 } = require('./phash');
const { runJob, detailGroups, imageFileFor } = require('./similarity');
const keypoints = require('./keypoints');

/**
 * "Similar by content": a vector of each image from the local tagger model (its
 * features before the tag head, see autotag.embedFile). Pictures of the same thing
 * point the same way: a crop, a mirror, a recoloured or captioned edit of one art,
 * close variations of it. Stored in ItemEmbeddings as int8 (768 bytes per image),
 * keyed to the file's hash, so an edited image simply counts as not computed.
 *
 * Grouping compares every pair: a 256-bit sign sketch of each vector (random
 * hyperplanes) rules out most pairs with a popcount, the exact cosine decides the rest.
 * Optionally each linked pair is then checked by keypoints (services/keypoints):
 * only "the same picture" stays — crops and edits, not merely similar art.
 */

const DIM = 768;
const SKETCH_WORDS = 8;   // 256 bits

const IMAGES = `i.mimeType LIKE 'image/%' AND i.deletedAt IS NULL`;
const MISSING = `(e.itemId IS NULL OR e.fileHash IS NOT i.fileHash)`;
// Items.id is declared UUID (numeric affinity): joined as is, SQLite can't use the
// ItemEmbeddings key and scans the whole table per image. CAST keeps it on the index.

async function status() {
    const [{ total, missing }] = await sequelize.query(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN ${MISSING} THEN 1 ELSE 0 END) AS missing
         FROM Items i LEFT JOIN ItemEmbeddings e ON e.itemId = CAST(i.id AS TEXT) WHERE ${IMAGES}`,
        { type: QueryTypes.SELECT });
    return { total: Number(total) || 0, missing: Number(missing) || 0, model: autotag.installed() };
}

// Float vector (unit length) ↔ int8 bytes, scaled per vector (cosine doesn't care).
function quantize(v) {
    let max = 0;
    for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i]));
    const q = Buffer.alloc(v.length);
    const k = max ? 127 / max : 0;
    for (let i = 0; i < v.length; i++) q.writeInt8(Math.round(v[i] * k), i);
    return q;
}

function dequantize(buf) {
    const v = new Float32Array(DIM);
    let n = 0;
    for (let i = 0; i < DIM; i++) { v[i] = buf.readInt8(i); n += v[i] * v[i]; }
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < DIM; i++) v[i] /= n;
    return v;
}

/** Vectors for every image that has none (or an outdated one). Cancellable. */
function computeMissing(onProgress) {
    return runJob('content', async (cancelled) => {
        if (!autotag.installed()) throw new Error('Нужна модель автотегов — скачай её в настройках');
        const rows = await sequelize.query(
            `SELECT i.id, i.fileHash FROM Items i LEFT JOIN ItemEmbeddings e ON e.itemId = CAST(i.id AS TEXT)
             WHERE ${IMAGES} AND ${MISSING}`, { type: QueryTypes.SELECT });
        const total = rows.length;
        let done = 0, ok = 0, failed = 0;
        onProgress?.({ done, total, ok, failed });
        for (const { id, fileHash } of rows) {
            if (cancelled()) break;
            let vec = Buffer.alloc(0);   // empty = couldn't be read; not retried until the file changes
            try {
                const file = imageFileFor(id);
                if (!file) throw new Error('no file');
                vec = quantize(await autotag.embedFile(file));
                ok++;
            } catch { failed++; }
            await sequelize.query(
                'INSERT OR REPLACE INTO ItemEmbeddings (itemId, fileHash, vec) VALUES (?, ?, ?)',
                { replacements: [id, fileHash, vec] });
            done++;
            onProgress?.({ done, total, ok, failed });
        }
        return { total, done, ok, failed, cancelled: cancelled() };
    });
}

// Deterministic random hyperplanes (the same sketch every run).
let planes = null;
function hyperplanes() {
    if (planes) return planes;
    let seed = 0x9e3779b9;
    const rnd = () => {   // mulberry32
        seed = (seed + 0x6d2b79f5) | 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
    planes = Array.from({ length: SKETCH_WORDS * 32 }, () => Float32Array.from({ length: DIM }, gauss));
    return planes;
}

function sketch(v, out, at) {
    const P = hyperplanes();
    for (let w = 0; w < SKETCH_WORDS; w++) {
        let bits = 0;
        for (let b = 0; b < 32; b++) {
            const p = P[w * 32 + b];
            let s = 0;
            for (let i = 0; i < DIM; i++) s += p[i] * v[i];
            bits = (bits << 1) | (s > 0 ? 1 : 0);
        }
        out[at + w] = bits >>> 0;
    }
}

// Sketch bits that may differ for a pair at cosine ≥ t (expected + 4σ).
function sketchCutoff(t) {
    const bits = SKETCH_WORDS * 32;
    const p = Math.acos(Math.min(1, Math.max(-1, t))) / Math.PI;
    return Math.ceil(bits * p + 4 * Math.sqrt(bits * p * (1 - p)) + 2);
}

/**
 * Groups of images alike by content. threshold = minimal cosine (0.80–0.99);
 * `verify` keeps only pairs that keypoints confirm as the same picture.
 * onProgress({ stage: 'compare'|'verify', pct }).
 */
async function findByContent(threshold = 0.9, { verify = false } = {}, onProgress) {
    const t = Math.max(0.5, Math.min(0.995, Number(threshold) || 0.9));
    const rows = await sequelize.query(
        `SELECT i.id, e.vec FROM Items i JOIN ItemEmbeddings e ON e.itemId = CAST(i.id AS TEXT)
         WHERE ${IMAGES} AND e.fileHash IS i.fileHash AND length(e.vec) = ${DIM}`,
        { type: QueryTypes.SELECT });
    const n = rows.length;
    const vecs = new Float32Array(n * DIM);
    const sk = new Uint32Array(n * SKETCH_WORDS);
    for (let i = 0; i < n; i++) {
        const v = dequantize(Buffer.from(rows[i].vec));
        vecs.set(v, i * DIM);
        sketch(v, sk, i * SKETCH_WORDS);
        if (i % 500 === 0) await new Promise(r => setImmediate(r));
    }
    const cut = sketchCutoff(t);
    const cosine = (i, j) => {
        let s = 0;
        const a = i * DIM, b = j * DIM;
        for (let k = 0; k < DIM; k++) s += vecs[a + k] * vecs[b + k];
        return s;
    };

    // Pairs above the threshold (walked with linkGroups only for its slicing/progress).
    const pairs = [];
    await linkGroups(n, (i, j) => {
        let h = 0;
        const a = i * SKETCH_WORDS, b = j * SKETCH_WORDS;
        for (let w = 0; w < SKETCH_WORDS && h <= cut; w++) h += popcount32(sk[a + w] ^ sk[b + w]);
        if (h > cut) return null;
        const c = cosine(i, j);
        if (c < t) return null;
        pairs.push([i, j, c]);
        return null;   // grouped below, after the optional check
    }, { onProgress: pct => onProgress?.({ stage: 'compare', pct }), rowsPerSlice: 100 });

    let linked = pairs.map(([i, j, c]) => ({ i, j, score: c, mirrored: false, same: null }));
    if (verify && linked.length) {
        const m = keypoints.matcher();
        const files = new Map();
        const fileOf = (i) => {
            if (!files.has(i)) files.set(i, imageFileFor(rows[i].id));
            return files.get(i);
        };
        try {
            // Grouped by the first image, so its keypoints stay cached.
            linked.sort((a, b) => a.i - b.i || a.j - b.j);
            for (let k = 0; k < linked.length; k++) {
                const p = linked[k];
                const fa = fileOf(p.i), fb = fileOf(p.j);
                const r = fa && fb ? await m.same(fa, fb) : { same: false };
                p.same = r.same;
                p.mirrored = !!r.mirrored;
                if (k % 5 === 0) {
                    onProgress?.({ stage: 'verify', pct: Math.round((k / linked.length) * 100) });
                    await new Promise(r2 => setImmediate(r2));
                }
            }
        } finally { m.close(); }
        linked = linked.filter(p => p.same);
    }

    const { groups, best } = groupPairs(n, linked.map(p => ({ i: p.i, j: p.j, score: p.score, extra: p.mirrored })), (a, b) => a > b);

    return {
        ...await detailGroups(groups.map(g => g.map(i => ({
            id: rows[i].id,
            similarity: Math.round(best[i].score * 100),
            mirrored: best[i].extra,
            samePicture: verify || undefined,
        })))),
        compared: n,
    };
}

module.exports = { status, computeMissing, findByContent, quantize, dequantize };
