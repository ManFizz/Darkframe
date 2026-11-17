const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const sequelize = require('../database');
const { Item } = require('../models/associations');
const Collection = require('../models/Collection');
const { getActive } = require('../libraryRegistry');
const { phashPair, groupSimilar, linkGroups, pairDistance } = require('./phash');
const { vhashOf, parseVhash, compareVhash } = require('./videoHash');
const { itemUrls } = require('./itemUrls');

// Near-duplicate finder.
//   images — perceptual hash of the picture and of its mirror image (GIFs by their
//            first frame); NULL = not computed yet, '' = couldn't be hashed; reset
//            whenever an image is edited
//   videos — a few frame hashes across the video (services/videoHash), reset on edit
// Content vectors (crops, edits, variations) live in services/embeddings.

const itemsPath = () => getActive().itemsPath;   // active library, may change at runtime
const IMAGES = { mimeType: { [Op.like]: 'image/%' } };
const VIDEOS = { mimeType: { [Op.like]: 'video/%' } };
const NOT_HASHED = { [Op.or]: [{ phash: null }, { phashMirror: null }] };
const HASHED = { phash: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } };

async function phashStatus() {
    const [total, missing] = await Promise.all([
        Item.count({ where: IMAGES }),
        Item.count({ where: { ...IMAGES, ...NOT_HASHED } }),
    ]);
    return { total, missing };
}

async function videoStatus() {
    const [total, missing] = await Promise.all([
        Item.count({ where: VIDEOS }),
        Item.count({ where: { ...VIDEOS, vhash: null } }),
    ]);
    return { total, missing };
}

// What the library actually displays: display.jpg for HEIC originals, else original.*
function imageFileFor(id) {
    const dir = path.join(itemsPath(), id);
    const display = path.join(dir, 'display.jpg');
    if (fs.existsSync(display)) return display;
    return originalFileFor(id);
}

function originalFileFor(id) {
    const dir = path.join(itemsPath(), id);
    try {
        const f = fs.readdirSync(dir).find(x => /^original\./i.test(x));
        return f ? path.join(dir, f) : null;
    } catch { return null; }
}

// ── Background jobs: one per kind at a time, cancellable ────────────────────────
const jobs = new Map();   // kind → { promise, cancelled }

function runJob(kind, work) {
    if (jobs.has(kind)) return jobs.get(kind).promise;
    const job = { cancelled: false };
    job.promise = (async () => {
        try { return await work(() => job.cancelled); }
        finally { jobs.delete(kind); }
    })();
    jobs.set(kind, job);
    return job.promise;
}

function cancelJob(kind) {
    const job = jobs.get(kind);
    if (job) job.cancelled = true;
    return { ok: !!job };
}

const isRunning = (kind) => jobs.has(kind);

/**
 * Compute a value for each row and write the results in small transactions —
 * thousands of lone UPDATEs are slow. `compute(row)` → fields to set, or throws
 * (then `failed(row)` fields are written, so it isn't retried forever).
 */
async function fillIn(rows, { compute, failed, onProgress, cancelled }) {
    const total = rows.length;
    let done = 0, ok = 0, bad = 0;
    onProgress?.({ done, total, ok, failed: bad });
    let pending = [];
    const flush = async () => {
        if (!pending.length) return;
        const batch = pending; pending = [];
        await sequelize.transaction(async (t) => {
            for (const { id, fields } of batch) await Item.unscoped().update(fields, { where: { id }, transaction: t });
        });
    };
    for (const row of rows) {
        if (cancelled?.()) break;
        let fields;
        try { fields = await compute(row); ok++; }
        catch { fields = failed(row); bad++; }
        pending.push({ id: row.id, fields });
        done++;
        if (pending.length >= 50) await flush();
        if (done % 5 === 0 || done === total) onProgress?.({ done, total, ok, failed: bad });
    }
    await flush();
    return { total, done, ok, failed: bad, cancelled: !!cancelled?.() };
}

async function hashImage(id) {
    const file = imageFileFor(id);
    if (!file) throw new Error('no file');
    const { phash, mirror } = await phashPair(fs.readFileSync(file));
    return { phash, phashMirror: mirror };
}

function computeMissing(onProgress) {
    return runJob('images', async (cancelled) => {
        const rows = await Item.findAll({ where: { ...IMAGES, ...NOT_HASHED }, attributes: ['id'], raw: true });
        return fillIn(rows, {
            compute: ({ id }) => hashImage(id),
            failed: () => ({ phash: '', phashMirror: '' }),
            onProgress, cancelled,
        });
    });
}

function computeVideoMissing(onProgress) {
    return runJob('videos', async (cancelled) => {
        const rows = await Item.findAll({ where: { ...VIDEOS, vhash: null }, attributes: ['id'], raw: true });
        return fillIn(rows, {
            compute: async ({ id }) => {
                const file = originalFileFor(id);
                return { vhash: file ? await vhashOf(file) : '' };
            },
            failed: () => ({ vhash: '' }),
            onProgress, cancelled,
        });
    });
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/**
 * Raw groups → what the duplicate finder shows. `raw` = arrays of { id, ...extra }
 * (extra: similarity, mirrored, …, copied onto the row). Within a group the best
 * copy (most pixels, then biggest file) comes first — the natural one to keep.
 */
async function detailGroups(raw) {
    const extra = new Map(raw.flat().map(x => [x.id, x]));
    const details = [];
    for (const part of chunk([...extra.keys()], 900)) {   // stay under SQLite's variable limit
        details.push(...await Item.findAll({
            where: { id: { [Op.in]: part } },
            include: [{ model: Collection, as: 'collection', attributes: ['id', 'name'] }],
        }));
    }
    const byId = new Map(details.map(it => [it.id, it]));

    let totalItems = 0, reclaimable = 0;
    const groups = [];
    for (const g of raw) {
        const rows = g.map(({ id }) => {
            const it = byId.get(id);
            if (!it) return null;
            const { id: _, ...more } = extra.get(id);
            return {
                id: it.id,
                title: it.title || it.fileName,
                fileName: it.fileName,
                size: it.size,
                mimeType: it.mimeType,
                width: it.width,
                height: it.height,
                duration: it.duration,
                importedAt: it.importedAt,
                collectionId: it.collectionId,
                collectionName: it.collection?.name || 'Без коллекции',
                thumbPath: itemUrls(it).thumbPath,
                ...more,
            };
        }).filter(Boolean);
        if (rows.length < 2) continue;

        rows.sort((a, b) => ((b.width * b.height) - (a.width * a.height)) || ((b.size || 0) - (a.size || 0)));
        totalItems += rows.length;
        reclaimable += rows.slice(1).reduce((s, r) => s + (r.size || 0), 0);
        groups.push({ hash: rows.map(r => r.id).join('|'), items: rows });
    }
    groups.sort((a, b) => b.items.length - a.items.length);

    return { groups, totalGroups: groups.length, totalItems, reclaimable };
}

const bitsSimilarity = (d) => Math.round(((64 - d) / 64) * 100);

/**
 * Groups of visually similar images. maxDistance = allowed differing bits (of 64).
 * `mirror` also links an image with a mirrored copy of it.
 */
async function findSimilar(maxDistance = 8, onProgress, { mirror = true } = {}) {
    const d = Math.max(0, Math.min(20, Math.round(Number(maxDistance) || 8)));
    const entries = await Item.findAll({
        where: { ...IMAGES, ...HASHED },
        attributes: ['id', 'phash', 'phashMirror'],
        raw: true,
    });
    const raw = await groupSimilar(
        entries.map(e => ({ id: e.id, phash: e.phash, mirror: mirror ? e.phashMirror : null })), d, onProgress);
    return detailGroups(raw.map(g => g.map(x => ({
        id: x.id, distance: x.distance, similarity: bitsSimilarity(x.distance), mirrored: x.mirrored,
    }))));
}

/**
 * Groups of similar videos: re-encoded / resized copies, and cuts of a longer video.
 * maxDistance = allowed differing bits per frame (of 64).
 */
async function findSimilarVideos(maxDistance = 10, onProgress) {
    const d = Math.max(0, Math.min(24, Math.round(Number(maxDistance) || 10)));
    const rows = await Item.findAll({
        where: { ...VIDEOS, vhash: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
        attributes: ['id', 'vhash'],
        raw: true,
    });
    const fp = rows.map(r => parseVhash(r.vhash)).map(f => (f.hi.length >= 3 ? f : null));
    const { groups, best } = await linkGroups(rows.length, (i, j) => {
        if (!fp[i] || !fp[j]) return null;
        const m = compareVhash(fp[i], fp[j], d);
        return m == null ? null : { score: m };
    }, { onProgress, rowsPerSlice: 50 });
    return detailGroups(groups.map(g => g.map(i => ({
        id: rows[i].id, distance: best[i].score, similarity: bitsSimilarity(best[i].score),
    }))));
}

const toRow = (it, extra = {}) => ({
    id: it.id,
    title: it.title || it.fileName,
    size: it.size,
    mimeType: it.mimeType,
    width: it.width,
    height: it.height,
    importedAt: it.importedAt,
    collectionName: it.collection?.name || 'Без коллекции',
    thumbPath: itemUrls(it).thumbPath,
    ...extra,
});

/**
 * Copies and look-alikes of one item (the viewer's side panel): exact copies by file
 * hash, near-duplicates by perceptual hash (computed on the spot when missing).
 * Other items are only compared if their hash already exists (the control panel's
 * near-duplicate search fills the rest).
 */
async function relationsOf(id, maxDistance = 12) {
    const item = await Item.findByPk(id);
    if (!item) return { exact: [], similar: [], unhashed: 0 };
    const include = [{ model: Collection, as: 'collection', attributes: ['id', 'name'] }];

    const exact = item.fileHash
        ? (await Item.findAll({ where: { fileHash: item.fileHash, id: { [Op.ne]: id } }, include })).map(it => toRow(it))
        : [];

    let similar = [];
    let unhashed = 0;
    if (String(item.mimeType).startsWith('image/')) {
        const ph = await ensureHash(item);
        if (ph) {
            const rows = await Item.findAll({
                where: { ...IMAGES, id: { [Op.ne]: id }, ...HASHED },
                attributes: ['id', 'phash', 'phashMirror'], raw: true,
            });
            const exactIds = new Set(exact.map(e => e.id));
            const near = rows
                .map(r => ({ id: r.id, d: pairDistance(ph, r.phash, r.phashMirror).d }))
                .filter(r => r.d <= maxDistance && !exactIds.has(r.id))
                .sort((a, b) => a.d - b.d)
                .slice(0, 12);
            if (near.length) {
                const byId = new Map((await Item.findAll({ where: { id: near.map(n => n.id) }, include })).map(it => [it.id, it]));
                similar = near.filter(n => byId.has(n.id))
                    .map(n => toRow(byId.get(n.id), { distance: n.d, similarity: Math.round(((64 - n.d) / 64) * 100) }));
            }
            unhashed = await Item.count({ where: { ...IMAGES, phash: null } });
        }
    }
    return { exact, similar, unhashed };
}

// The item's pHash, computed (with its mirror) on the spot when missing; '' = none.
async function ensureHash(item) {
    if (item.phash != null && item.phashMirror != null) return item.phash;
    let fields;
    try { fields = await hashImage(item.id); } catch { fields = { phash: '', phashMirror: '' }; }
    await Item.unscoped().update(fields, { where: { id: item.id } });
    return fields.phash;
}

/**
 * Search by picture: library images whose perceptual hash is within maxDistance of
 * the query — an item of the library ({ id }) or any image bytes ({ buffer }, e.g.
 * the clipboard). Finds the same picture resized / recompressed / cropped a little /
 * recoloured, not "similar content". Closest first.
 */
async function searchByImage({ id, buffer, hash }, maxDistance = 14, limit = 300) {
    const d = Math.max(0, Math.min(28, Math.round(Number(maxDistance) || 14)));
    let ph = /^[0-9a-f]{16}$/i.test(hash || '') ? hash : null;   // re-run of an earlier query
    if (ph) { /* ready */ } else if (id) {
        const item = await Item.findByPk(id, { attributes: ['id', 'phash', 'phashMirror', 'mimeType'], raw: true });
        if (!item || !String(item.mimeType).startsWith('image/')) return { error: 'Искать можно только по картинке' };
        ph = await ensureHash(item);
    } else if (buffer) {
        ph = await phashPair(Buffer.from(buffer)).then(r => r.phash, () => '');
    }
    if (!ph) return { error: 'Не удалось разобрать картинку' };

    const rows = await Item.findAll({
        where: { ...IMAGES, ...HASHED },
        attributes: ['id', 'phash', 'phashMirror'], raw: true,
    });
    const results = rows
        .map(r => ({ id: r.id, distance: pairDistance(ph, r.phash, r.phashMirror).d }))
        .filter(r => r.distance <= d)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit)
        .map(r => ({ ...r, similarity: Math.round(((64 - r.distance) / 64) * 100) }));
    const unhashed = await Item.count({ where: { ...IMAGES, phash: null } });
    return { hash: ph, results, unhashed, maxDistance: d };
}

module.exports = {
    phashStatus, videoStatus, computeMissing, computeVideoMissing, cancelJob, isRunning, runJob,
    findSimilar, findSimilarVideos, relationsOf, searchByImage, detailGroups, imageFileFor,
};
