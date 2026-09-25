const fs = require('fs');
const path = require('path');
const { Item, ItemTag } = require('../models/associations');
const { getActive } = require('../libraryRegistry');
const { generateImageThumb, generateVideoThumb, getVideoDuration } = require('./thumbService');
const { thumbAt } = require('./ffmpegOps');

const ITEMS_PATH = getActive().itemsPath;

function findOriginal(itemDir) {
    try {
        const f = fs.readdirSync(itemDir).find(x => /^original\./i.test(x));
        return f ? path.join(itemDir, f) : null;
    } catch { return null; }
}

function dirSize(dir) {
    let total = 0;
    try {
        for (const name of fs.readdirSync(dir)) {
            const p = path.join(dir, name);
            try {
                // lstat, not stat: never follow symlinks — a link cycle would
                // otherwise recurse forever / count foreign trees.
                const st = fs.lstatSync(p);
                if (st.isSymbolicLink()) continue;
                total += st.isDirectory() ? dirSize(p) : st.size;
            } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
    return total;
}

// ─── Integrity ────────────────────────────────────────────────────────────────
// Two kinds of rot: DB rows whose original file is gone, and item folders on disk
// with no matching DB row (orphans left by a crash / manual meddling).
async function checkIntegrity() {
    const items = await Item.unscoped().findAll({ attributes: ['id', 'title', 'fileName', 'deletedAt'] });
    const idSet = new Set(items.map(i => i.id));

    const missing = [];
    for (const it of items) {
        if (!findOriginal(path.join(ITEMS_PATH, it.id))) {
            missing.push({
                id: it.id,
                title: it.title || it.fileName,
                fileName: it.fileName,
                trashed: !!it.deletedAt,
            });
        }
    }

    const orphans = [];
    let entries = [];
    try { entries = fs.readdirSync(ITEMS_PATH, { withFileTypes: true }); } catch { /* ignore */ }
    for (const e of entries) {
        if (!e.isDirectory() || idSet.has(e.name)) continue;
        orphans.push({ name: e.name, size: dirSize(path.join(ITEMS_PATH, e.name)) });
    }

    const orphanBytes = orphans.reduce((s, o) => s + o.size, 0);
    return { missing, orphans, orphanBytes, totalItems: items.length };
}

// Permanently drop DB rows (+ tag links) whose files are already gone.
async function removeMissingRecords(ids = []) {
    if (!ids.length) return { ok: true, count: 0 };
    for (const id of ids) {
        await ItemTag.destroy({ where: { itemId: id } });
        await Item.unscoped().destroy({ where: { id } });
        try { fs.rmSync(path.join(ITEMS_PATH, id), { recursive: true, force: true }); } catch { /* ignore */ }
    }
    return { ok: true, count: ids.length };
}

// Delete on-disk folders that don't back any DB row. Re-checks against the DB and
// rejects anything that isn't a plain name under ITEMS_PATH, so a real item is never
// wiped by a stale/forged name.
async function removeOrphanFolders(names = []) {
    if (!names.length) return { ok: true, count: 0 };
    const items = await Item.unscoped().findAll({ attributes: ['id'] });
    const idSet = new Set(items.map(i => i.id));

    let count = 0;
    for (const name of names) {
        if (idSet.has(name)) continue;
        if (typeof name !== 'string' || name.includes('/') || name.includes('\\') || name.includes('..')) continue;
        try { fs.rmSync(path.join(ITEMS_PATH, name), { recursive: true, force: true }); count++; }
        catch { /* ignore */ }
    }
    return { ok: true, count };
}

// ─── Missing thumbnails / dimensions ──────────────────────────────────────────
const isVideo = (mime) => (mime || '').startsWith('video/');

async function generateMissingMedia(onProgress) {
    const items = await Item.unscoped().findAll();

    // Only touch what's actually missing: no thumb.jpg, or zero width/height.
    const todo = [];
    for (const it of items) {
        const dir = path.join(ITEMS_PATH, it.id);
        const original = findOriginal(dir);
        if (!original) continue;   // that's integrity's job, not ours
        const thumbMissing = !fs.existsSync(path.join(dir, 'thumb.jpg'));
        const dimsMissing  = !it.width || !it.height;
        if (thumbMissing || dimsMissing) todo.push({ it, dir, original, dimsMissing });
    }

    const total = todo.length;
    let done = 0, fixed = 0, failed = 0;
    onProgress?.({ done, total, fixed, failed });

    for (const { it, dir, original, dimsMissing } of todo) {
        try {
            const thumbPath = path.join(dir, 'thumb.jpg');
            const patch = {};
            if (isVideo(it.mimeType)) {
                // Respect a thumbnail frame the user picked; otherwise the default (10%).
                if (it.thumbAt != null) await thumbAt(original, thumbPath, it.thumbAt);
                else await generateVideoThumb(original, thumbPath);
                if (it.duration == null) {
                    const d = await getVideoDuration(original);
                    if (d != null) patch.duration = d;
                }
            } else {
                const size = await generateImageThumb(original, thumbPath);
                if (dimsMissing) { patch.width = size.width; patch.height = size.height; }
            }
            if (Object.keys(patch).length) {
                await Item.unscoped().update(patch, { where: { id: it.id } });
            }
            fixed++;
        } catch (e) {
            console.error('generateMissingMedia failed for', it.id, e.message);
            failed++;
        }
        done++;
        onProgress?.({ done, total, fixed, failed });
    }

    return { total, fixed, failed };
}

module.exports = { checkIntegrity, removeMissingRecords, removeOrphanFolders, generateMissingMedia };
