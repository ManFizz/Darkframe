const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const sequelize = require('../database');
const { Item } = require('../models/associations');
const Collection = require('../models/Collection');
const { getActive } = require('../libraryRegistry');
const { phashOf, groupSimilar, popcount32 } = require('./phash');
const { itemUrls } = require('./itemUrls');

// Near-duplicate finder (perceptual hash). Still images only — GIFs by their first
// frame; videos are not compared. Hashes are computed lazily (NULL = not yet,
// '' = couldn't be hashed) and reset whenever an image is edited.

const itemsPath = () => getActive().itemsPath;   // active library, may change at runtime
const IMAGES = { mimeType: { [Op.like]: 'image/%' } };

async function phashStatus() {
    const [total, missing] = await Promise.all([
        Item.count({ where: IMAGES }),
        Item.count({ where: { ...IMAGES, phash: null } }),
    ]);
    return { total, missing };
}

// What the library actually displays: display.jpg for HEIC originals, else original.*
function imageFileFor(id) {
    const dir = path.join(itemsPath(), id);
    const display = path.join(dir, 'display.jpg');
    if (fs.existsSync(display)) return display;
    try {
        const f = fs.readdirSync(dir).find(x => /^original\./i.test(x));
        return f ? path.join(dir, f) : null;
    } catch { return null; }
}

let running = null;   // one computation at a time

async function computeMissing(onProgress) {
    if (running) return running;
    running = (async () => {
        const rows = await Item.findAll({ where: { ...IMAGES, phash: null }, attributes: ['id'], raw: true });
        const total = rows.length;
        let done = 0, ok = 0, failed = 0;
        onProgress?.({ done, total, ok, failed });

        // Write results in small transactions — thousands of lone UPDATEs are slow.
        let pending = [];
        const flush = async () => {
            if (!pending.length) return;
            const batch = pending; pending = [];
            await sequelize.transaction(async (t) => {
                for (const { id, phash } of batch) {
                    await Item.unscoped().update({ phash }, { where: { id }, transaction: t });
                }
            });
        };

        for (const { id } of rows) {
            let value = '';   // '' marks "unhashable" so it isn't retried forever
            try {
                const file = imageFileFor(id);
                if (file) { value = await phashOf(fs.readFileSync(file)); ok++; }
                else failed++;
            } catch { failed++; }
            pending.push({ id, phash: value });
            done++;
            if (pending.length >= 100) await flush();
            if (done % 10 === 0 || done === total) onProgress?.({ done, total, ok, failed });
        }
        await flush();
        return { total, ok, failed };
    })();
    try { return await running; } finally { running = null; }
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/**
 * Groups of visually similar images. maxDistance = allowed differing bits (of 64).
 * Within a group the best copy (most pixels, then biggest file) comes first — the
 * natural one to keep.
 */
async function findSimilar(maxDistance = 8, onProgress) {
    const d = Math.max(0, Math.min(20, Math.round(Number(maxDistance) || 8)));
    const entries = await Item.findAll({
        where: { ...IMAGES, phash: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
        attributes: ['id', 'phash'],
        raw: true,
    });

    const raw = await groupSimilar(entries, d, onProgress);
    const ids = raw.flat().map(x => x.id);
    const distance = new Map(raw.flat().map(x => [x.id, x.distance]));

    const details = [];
    for (const part of chunk(ids, 900)) {   // stay under SQLite's variable limit
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
            const dist = distance.get(id);
            return {
                id: it.id,
                title: it.title || it.fileName,
                fileName: it.fileName,
                size: it.size,
                mimeType: it.mimeType,
                width: it.width,
                height: it.height,
                importedAt: it.importedAt,
                collectionId: it.collectionId,
                collectionName: it.collection?.name || 'Без коллекции',
                thumbPath: itemUrls(it).thumbPath,
                distance: dist,
                similarity: Math.round(((64 - dist) / 64) * 100),
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
 * Other items are only compared if their hash already exists — "Найти похожие" in
 * the control panel fills the rest.
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
        let ph = item.phash;
        if (ph == null) {
            try {
                const file = imageFileFor(id);
                ph = file ? await phashOf(fs.readFileSync(file)) : '';
            } catch { ph = ''; }
            await Item.unscoped().update({ phash: ph }, { where: { id } });
        }
        if (ph) {
            const hi = parseInt(ph.slice(0, 8), 16) >>> 0, lo = parseInt(ph.slice(8), 16) >>> 0;
            const rows = await Item.findAll({
                where: { ...IMAGES, id: { [Op.ne]: id }, phash: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
                attributes: ['id', 'phash'], raw: true,
            });
            const exactIds = new Set(exact.map(e => e.id));
            const near = rows
                .map(r => ({ id: r.id, d: popcount32(hi ^ (parseInt(r.phash.slice(0, 8), 16) >>> 0)) + popcount32(lo ^ (parseInt(r.phash.slice(8), 16) >>> 0)) }))
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

const distanceOf = (hi, lo, phash) =>
    popcount32(hi ^ (parseInt(phash.slice(0, 8), 16) >>> 0)) + popcount32(lo ^ (parseInt(phash.slice(8), 16) >>> 0));

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
        const item = await Item.findByPk(id, { attributes: ['id', 'phash', 'mimeType'], raw: true });
        if (!item || !String(item.mimeType).startsWith('image/')) return { error: 'Искать можно только по картинке' };
        ph = item.phash;
        if (ph == null) {
            const file = imageFileFor(id);
            ph = file ? await phashOf(fs.readFileSync(file)).catch(() => '') : '';
            await Item.unscoped().update({ phash: ph }, { where: { id } });
        }
    } else if (buffer) {
        ph = await phashOf(Buffer.from(buffer)).catch(() => '');
    }
    if (!ph) return { error: 'Не удалось разобрать картинку' };

    const hi = parseInt(ph.slice(0, 8), 16) >>> 0, lo = parseInt(ph.slice(8), 16) >>> 0;
    const rows = await Item.findAll({
        where: { ...IMAGES, phash: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
        attributes: ['id', 'phash'], raw: true,
    });
    const results = rows
        .map(r => ({ id: r.id, distance: distanceOf(hi, lo, r.phash) }))
        .filter(r => r.distance <= d)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit)
        .map(r => ({ ...r, similarity: Math.round(((64 - r.distance) / 64) * 100) }));
    const unhashed = await Item.count({ where: { ...IMAGES, phash: null } });
    return { hash: ph, results, unhashed, maxDistance: d };
}

module.exports = { phashStatus, computeMissing, findSimilar, relationsOf, searchByImage };
