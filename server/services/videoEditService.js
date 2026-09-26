const fs = require('fs');
const os = require('os');
const path = require('path');
const { getActive } = require('../libraryRegistry');
const { Item, Tag } = require('../models/associations');
const ops = require('./ffmpegOps');

const ITEMS_PATH = getActive().itemsPath;
const now = () => Math.floor(Date.now() / 1000);

function findIn(dir, re) {
    try {
        const f = fs.readdirSync(dir).find(x => re.test(x));
        return f ? path.join(dir, f) : null;
    } catch { return null; }
}
const findOriginal = (dir) => findIn(dir, /^original\./i);
const findSource   = (dir) => findIn(dir, /^source\./i);

async function loadVideo(id) {
    const item = await Item.unscoped().findByPk(id);
    if (!item) throw new Error('Элемент не найден');
    if (!(item.mimeType || '').startsWith('video/')) throw new Error('Это не видео');
    const dir = path.join(ITEMS_PATH, item.id);
    const original = findOriginal(dir);
    if (!original) throw new Error('Файл видео не найден');
    return { item, dir, original };
}

// Re-read everything that depends on the file bytes after they changed.
async function refreshMeta(original, dir, thumbTime) {
    const meta = await ops.probe(original);
    const at = thumbTime != null ? thumbTime : (meta.duration || 0) * 0.1;
    try { await ops.thumbAt(original, path.join(dir, 'thumb.jpg'), at); }
    catch (e) { console.error('thumb regen failed:', e.message); }
    return {
        duration: meta.duration,
        width:    meta.width,
        height:   meta.height,
        size:     fs.statSync(original).size,
        fileHash: await ops.hashFile(original),
    };
}

/**
 * Permanently keep only [start, end] of a library video.
 *   mode   'precise' (re-encode, frame-accurate) | 'fast' (stream copy, keyframe-snapped)
 *   backup keep the pristine file as source.<ext> on the first edit (enables revert)
 * The container is kept, so the original's extension never changes.
 */
async function trimVideo(id, { start, end, mode = 'precise', backup = true } = {}, onProgress) {
    const { item, dir, original } = await loadVideo(id);
    start = Math.max(0, Number(start) || 0);
    end   = Number(end) || 0;
    if (!(end - start >= 0.1)) throw new Error('Слишком короткий отрезок');

    const ext = path.extname(original).toLowerCase();
    if (backup) {
        const src = path.join(dir, `source${ext}`);
        if (!fs.existsSync(src)) fs.copyFileSync(original, src);
    }

    // Temp name must NOT start with "original" — the library:// protocol and
    // maintenance pick the first "original*" file in the folder.
    const tmp = path.join(dir, `_trim_tmp${ext}`);
    try {
        await ops.trimFile(original, tmp, { start, end, mode, onProgress });
        await ops.replaceFile(tmp, original);
    } finally {
        if (fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
    }

    // A chosen thumbnail frame survives the cut if it's inside the kept range.
    const thumbAt = item.thumbAt != null && item.thumbAt >= start && item.thumbAt <= end
        ? item.thumbAt - start
        : null;

    const meta = await refreshMeta(original, dir, thumbAt);
    const editedAt = now();
    await Item.unscoped().update({ ...meta, thumbAt, editedAt }, { where: { id } });
    return { ok: true, editedAt, duration: meta.duration };
}

// Restore the pristine video kept by the first trim.
async function revertVideo(id) {
    const { dir, original } = await loadVideo(id);
    const source = findSource(dir);
    if (!source) throw new Error('Нет сохранённого оригинала для отката');

    const target = path.join(dir, `original${path.extname(source).toLowerCase()}`);
    if (target !== original && fs.existsSync(original)) fs.unlinkSync(original);
    await ops.replaceFile(source, target);

    const meta = await refreshMeta(target, dir, null);
    await Item.unscoped().update({ ...meta, thumbAt: null, editedAt: null }, { where: { id } });
    return { ok: true };
}

// Use the frame at `time` as the gallery thumbnail. Remembered in thumbAt so later
// regenerations (maintenance, trims) keep the choice. The file itself is untouched,
// so neither editedAt nor fileHash change.
async function setVideoThumb(id, time) {
    const { dir, original } = await loadVideo(id);
    const at = Math.max(0, Number(time) || 0);
    await ops.thumbAt(original, path.join(dir, 'thumb.jpg'), at);
    await Item.unscoped().update({ thumbAt: at }, { where: { id } });
    return { ok: true, thumbAt: at };
}

const fmtTime = (t) => {
    t = Math.max(0, Math.floor(t));
    const m = Math.floor(t / 60), s = String(t % 60).padStart(2, '0');
    return `${m}:${s}`;
};
const safeName = (s) => String(s || 'video').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80).trim() || 'video';

/**
 * Grab the frame at `time` as a JPEG (q≈95, full resolution) and import it.
 *   { itemId }                      — a library video: the frame joins the same
 *                                     collection with the video's tags and source
 *   { url, title, tags, sourceUrl } — a remote / folder video (r34, folders):
 *                                     imported uncategorized
 */
async function captureVideoFrame({ itemId, url, time, title, tags = [], sourceUrl = '' } = {}) {
    const { importFile } = require('./importService');

    let src, collectionId = null, baseTitle = title;
    if (itemId) {
        const item = await Item.unscoped().findByPk(itemId, {
            include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
        });
        if (!item) throw new Error('Элемент не найден');
        src = findOriginal(path.join(ITEMS_PATH, item.id));
        if (!src) throw new Error('Файл видео не найден');
        collectionId = item.collectionId;
        baseTitle = item.title || item.fileName;
        tags = (item.tags || []).map(t => t.name);
        sourceUrl = item.sourceUrl || '';
    } else if (ops.isUrl(url)) {
        src = url;
    } else if (url && fs.existsSync(url) && fs.statSync(url).isFile()) {
        src = url;   // a file from the Folders source
    } else {
        throw new Error('Неподдерживаемый источник видео');
    }

    // Hot-link protected CDNs want a same-site Referer: prefer the post page's origin.
    let referer;
    try {
        if (ops.isUrl(src)) referer = new URL(ops.isUrl(sourceUrl) ? sourceUrl : src).origin + '/';
    } catch { /* ignore */ }

    const label = fmtTime(time);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-frame-'));
    const tmp = path.join(tmpDir, `${safeName(baseTitle)}_${label.replace(':', '-')}.jpg`);
    try {
        await ops.captureFrame(src, tmp, Number(time) || 0, { referer });
        const res = await importFile({
            quiet: true,   // a saved frame is not an import worth a progress pill
            filePath: tmp,
            collectionId,
            tags: Array.isArray(tags) ? tags : [],
            sourceUrl,
            allowDuplicate: true,
            overrides: { title: `${baseTitle || 'Видео'} — кадр ${label}` },
        });
        if (res.skipped) throw new Error('Кадр не импортирован');
        return { ok: true, id: res.item.id };
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

module.exports = { trimVideo, revertVideo, captureVideoFrame, setVideoThumb };
