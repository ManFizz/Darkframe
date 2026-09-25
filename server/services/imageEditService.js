const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { getActive } = require('../libraryRegistry');
const Item = require('../models/Item');
const { normalizeEditParams, applyColorToRaw, isNeutralColor } = require('../../src/js/shared/imageAdjust');

// fileHash follows the actual file bytes, so a cropped copy stops matching its
// source in the duplicate finder (and a revert makes it match again).
const hashBuffer = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Don't let libvips keep input files memory-mapped/open between calls — otherwise the
// original stays locked and the *next* edit's write-back fails (Windows sharing violation).
sharp.cache(false);

const ITEMS_PATH = getActive().itemsPath;
const THUMB_SIZE = 400;

// Files inside an item folder:
//   original.<ext> — what the library shows
//   source.<ext>   — pristine copy kept from the first edit (full revert)
//   base.<ext>     — edit starting point for items edited the old, cumulative way
//                    (their current look becomes the baseline so it isn't lost)
// Every edit is now applied to base/source from scratch using the full saved
// parameters, so repeated edits never compound JPEG loss.

const MIME_BY_EXT = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jfif': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
};

function findIn(dir, re) {
    try {
        const f = fs.readdirSync(dir).find(x => re.test(x));
        return f ? path.join(dir, f) : null;
    } catch { return null; }
}
const findOriginal = (dir) => findIn(dir, /^original\./i);
const findSource   = (dir) => findIn(dir, /^source\./i);
const findBase     = (dir) => findIn(dir, /^base\./i);

// Build thumb + read dimensions straight from the edited buffer, so we never re-open
// the original by path (which is what left a lingering handle on the file).
async function writeThumbAndSize(buf, thumbPath) {
    await sharp(buf)
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);
    const meta = await sharp(buf).metadata();
    return { width: meta.width || 0, height: meta.height || 0 };
}

// Encoder per target extension.
function encodeAs(pipeline, ext, quality) {
    switch (ext) {
        case '.png':  return pipeline.png();
        case '.webp': return pipeline.webp({ quality });
        case '.gif':  return pipeline.gif();
        default:      return pipeline.jpeg({ quality, mozjpeg: true });   // jpg / jpeg / fallback
    }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

// Windows can briefly report the file as busy (a viewer/decoder handle). Retry.
async function writeFileWithRetry(filePath, buf, attempts = 6) {
    for (let i = 0; i < attempts; i++) {
        try {
            try { fs.chmodSync(filePath, 0o666); } catch {}
            fs.writeFileSync(filePath, buf);
            return;
        } catch (e) {
            if (i === attempts - 1) throw e;
            await new Promise(r => setTimeout(r, 150));
        }
    }
}

function unlinkQuiet(p) {
    if (p && fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
}

// The file edits start from (and makes sure the pristine backup exists).
function prepareInput(item, dir, originalPath) {
    const ext = path.extname(originalPath).toLowerCase();
    let source = findSource(dir);
    if (!source) {
        source = path.join(dir, `source${ext}`);
        fs.copyFileSync(originalPath, source);
    }
    // Edited before parameters were stored → its current look is the baseline.
    if (item.editedAt && !item.editParams && !findBase(dir)) {
        fs.copyFileSync(originalPath, path.join(dir, `base${ext}`));
    }
    return findBase(dir) || source;
}

/**
 * Render the full edit — geometry, colour, output — from the pristine input:
 *   angle        degrees (EXIF auto-orient first)
 *   flipH/flipV  mirror
 *   crop         {x,y,w,h} fractions (0..1) of the *rotated* image box
 *   color        {brightness, contrast, saturation, gamma}, sliders -100..100
 *   output       {format: 'keep'|'jpeg'|'webp', quality, maxSide}
 */
async function editImage(id, rawParams = {}) {
    const params = normalizeEditParams(rawParams);
    const item = await Item.unscoped().findByPk(id);
    if (!item) throw new Error('Элемент не найден');

    const itemDir = path.join(ITEMS_PATH, id);
    const originalPath = findOriginal(itemDir);
    if (!originalPath) throw new Error('original file not found');

    const origExt = path.extname(originalPath).toLowerCase();
    // sharp only sees the first frame of an animated GIF, so editing would silently
    // drop the animation — refuse it.
    if (origExt === '.gif') throw new Error('Редактирование GIF не поддерживается');

    // Read into a buffer and feed sharp the buffer (not the path) — otherwise libvips
    // keeps the file open and the write-back below fails as "busy" on Windows.
    const inputPath = prepareInput(item, itemDir, originalPath);
    const inputBuf = fs.readFileSync(inputPath);

    const outExt = params.output.format === 'jpeg' ? '.jpg'
        : params.output.format === 'webp' ? '.webp'
        : origExt;

    // JPEG has no alpha, so rotation corners fill black; formats with alpha stay clear.
    const hasAlpha = outExt === '.png' || outExt === '.webp';
    const background = hasAlpha ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 0, g: 0, b: 0, alpha: 1 };

    // Stage 1: auto-orient via EXIF (matches what the browser/canvas shows), then flips.
    let stage1 = sharp(inputBuf).rotate();
    if (params.flipH) stage1 = stage1.flop();
    if (params.flipV) stage1 = stage1.flip();
    const orientedBuf = await stage1.toBuffer();

    // Stage 2: free-angle rotation with background fill.
    const rotatedBuf = await sharp(orientedBuf).rotate(params.angle, { background }).toBuffer();
    const meta = await sharp(rotatedBuf).metadata();
    const RW = meta.width, RH = meta.height;

    // Stage 3: crop (fractions → pixels in the rotated image), clamped to bounds.
    const c = params.crop;
    const left   = clamp(Math.round(c.x * RW), 0, RW - 1);
    const top    = clamp(Math.round(c.y * RH), 0, RH - 1);
    const width  = clamp(Math.round(c.w * RW), 1, RW - left);
    const height = clamp(Math.round(c.h * RH), 1, RH - top);
    let pipeline = sharp(rotatedBuf).extract({ left, top, width, height });

    // Stage 4: colour, on raw pixels with the same maths as the CSS preview.
    if (!isNeutralColor(params.color)) {
        const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
        applyColorToRaw(data, info.channels, params.color);
        pipeline = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
    }

    // Stage 5: optional downscale, then encode.
    if (params.output.maxSide) {
        pipeline = pipeline.resize(params.output.maxSide, params.output.maxSide, { fit: 'inside', withoutEnlargement: true });
    }
    if (outExt === '.jpg' || outExt === '.jpeg' || outExt === '.jfif') {
        pipeline = pipeline.flatten({ background: '#ffffff' });   // transparent → white, JPEG has no alpha
    }
    const outBuf = await encodeAs(pipeline, outExt, params.output.quality).toBuffer();

    // Thumb + dimensions from the buffer first (no path re-open of the original).
    const size = await writeThumbAndSize(outBuf, path.join(itemDir, 'thumb.jpg'));
    const newOriginal = path.join(itemDir, `original${outExt}`);
    await writeFileWithRetry(newOriginal, outBuf);
    if (newOriginal !== originalPath) unlinkQuiet(originalPath);          // format changed
    unlinkQuiet(path.join(itemDir, 'display.jpg'));                      // stale HEIC display copy

    const editedAt = Math.floor(Date.now() / 1000);
    const fileName = outExt === origExt
        ? item.fileName
        : path.basename(item.fileName, path.extname(item.fileName)) + outExt;

    await Item.unscoped().update({
        width: size.width,
        height: size.height,
        size: outBuf.length,
        fileHash: hashBuffer(outBuf),
        mimeType: MIME_BY_EXT[outExt] || item.mimeType,
        fileName,
        editedAt,
        editParams: JSON.stringify(params),
    }, { where: { id } });

    return { ok: true, width: size.width, height: size.height, editedAt, size: outBuf.length };
}

// Re-encode with new output settings, keeping the item's existing geometry/colour.
async function recompressImage(id, output = {}) {
    const item = await Item.unscoped().findByPk(id);
    if (!item) throw new Error('Элемент не найден');
    let params = {};
    try { params = JSON.parse(item.editParams || '{}') || {}; } catch { params = {}; }
    return editImage(id, { ...params, output });
}

// Restore the pristine backup and drop the edited state.
async function revertImage(id) {
    const item = await Item.unscoped().findByPk(id);
    if (!item) throw new Error('Элемент не найден');

    const itemDir = path.join(ITEMS_PATH, id);
    const originalPath = findOriginal(itemDir);
    const source = findSource(itemDir);
    if (!source) throw new Error('no backup to revert to');

    const srcExt = path.extname(source).toLowerCase();
    const pristine = fs.readFileSync(source);
    const size = await writeThumbAndSize(pristine, path.join(itemDir, 'thumb.jpg'));
    const target = path.join(itemDir, `original${srcExt}`);
    await writeFileWithRetry(target, pristine);
    if (originalPath && originalPath !== target) unlinkQuiet(originalPath);
    unlinkQuiet(source);
    unlinkQuiet(findBase(itemDir));

    const fileName = path.extname(item.fileName).toLowerCase() === srcExt
        ? item.fileName
        : path.basename(item.fileName, path.extname(item.fileName)) + srcExt;

    await Item.unscoped().update({
        width: size.width,
        height: size.height,
        size: pristine.length,
        fileHash: hashBuffer(pristine),
        mimeType: MIME_BY_EXT[srcExt] || item.mimeType,
        fileName,
        editedAt: null,
        editParams: null,
    }, { where: { id } });

    return { ok: true, width: size.width, height: size.height };
}

module.exports = { editImage, recompressImage, revertImage };
