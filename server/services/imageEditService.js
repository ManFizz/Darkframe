const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { getActive } = require('../libraryRegistry');
const Item = require('../models/Item');

// Don't let libvips keep input files memory-mapped/open between calls — otherwise the
// original stays locked and the *next* edit's write-back fails (Windows sharing violation).
sharp.cache(false);

const ITEMS_PATH = getActive().itemsPath;
const THUMB_SIZE = 400;

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

// sharp encoder per extension so we write back in the same format.
function encodeAs(pipeline, ext) {
    switch (ext) {
        case '.png':  return pipeline.png();
        case '.webp': return pipeline.webp({ quality: 92 });
        case '.gif':  return pipeline.gif();
        default:      return pipeline.jpeg({ quality: 92 });   // jpg / jpeg / fallback
    }
}

function findOriginal(itemDir) {
    if (!fs.existsSync(itemDir)) return null;
    const file = fs.readdirSync(itemDir).find(f => /^original\./i.test(f));
    return file ? path.join(itemDir, file) : null;
}

// Pristine copy kept beside the original the first time it's edited.
function backupPathFor(originalPath) {
    return path.join(path.dirname(originalPath), `source${path.extname(originalPath)}`);
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

/**
 * Permanently apply rotate/flip/crop to an item's original image.
 *   angle  — degrees, any value (auto-orient by EXIF is applied first)
 *   flipH/flipV — mirror
 *   crop   — { x, y, w, h } as fractions (0..1) of the *rotated* image box
 */
async function editImage(id, { angle = 0, flipH = false, flipV = false, crop } = {}) {
    const itemDir = path.join(ITEMS_PATH, id);
    const originalPath = findOriginal(itemDir);
    if (!originalPath) throw new Error('original file not found');

    const ext = path.extname(originalPath).toLowerCase();
    // sharp only sees the first frame of an animated GIF, so editing would silently
    // drop the animation — refuse it.
    if (ext === '.gif') throw new Error('Редактирование GIF не поддерживается');

    // Back up the pristine image on the very first edit, so "revert" is possible.
    const backup = backupPathFor(originalPath);
    if (!fs.existsSync(backup)) fs.copyFileSync(originalPath, backup);

    // Read into a buffer and feed sharp the buffer (not the path) — otherwise libvips
    // keeps the original file open and the write-back below fails as "busy" on Windows.
    const inputBuf = fs.readFileSync(originalPath);

    // JPEG has no alpha, so rotation corners fill black; formats with alpha stay clear.
    const hasAlpha = ext === '.png' || ext === '.webp';
    const background = hasAlpha ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 0, g: 0, b: 0, alpha: 1 };

    // Stage 1: auto-orient via EXIF (matches what the browser/canvas shows), then flips.
    let stage1 = sharp(inputBuf).rotate();
    if (flipH) stage1 = stage1.flop();
    if (flipV) stage1 = stage1.flip();
    const orientedBuf = await stage1.toBuffer();

    // Stage 2: free-angle rotation with background fill.
    const rotatedBuf = await sharp(orientedBuf).rotate(angle, { background }).toBuffer();
    const meta = await sharp(rotatedBuf).metadata();
    const RW = meta.width, RH = meta.height;

    // Stage 3: crop (fractions → pixels in the rotated image), clamped to bounds.
    const c = crop || { x: 0, y: 0, w: 1, h: 1 };
    const left   = clamp(Math.round(c.x * RW), 0, RW - 1);
    const top    = clamp(Math.round(c.y * RH), 0, RH - 1);
    const width  = clamp(Math.round(c.w * RW), 1, RW - left);
    const height = clamp(Math.round(c.h * RH), 1, RH - top);

    const outBuf = await encodeAs(
        sharp(rotatedBuf).extract({ left, top, width, height }),
        ext,
    ).toBuffer();

    // Thumb + dimensions from the buffer first (no path re-open of the original).
    const size = await writeThumbAndSize(outBuf, path.join(itemDir, 'thumb.jpg'));
    await writeFileWithRetry(originalPath, outBuf);

    const editedAt = Math.floor(Date.now() / 1000);
    await Item.unscoped().update(
        { width: size.width, height: size.height, editedAt },
        { where: { id } },
    );

    return { ok: true, width: size.width, height: size.height, editedAt };
}

// Restore the pristine backup and drop the edited state.
async function revertImage(id) {
    const itemDir = path.join(ITEMS_PATH, id);
    const originalPath = findOriginal(itemDir);
    if (!originalPath) throw new Error('original file not found');

    const backup = backupPathFor(originalPath);
    if (!fs.existsSync(backup)) throw new Error('no backup to revert to');

    const pristine = fs.readFileSync(backup);
    const size = await writeThumbAndSize(pristine, path.join(itemDir, 'thumb.jpg'));
    await writeFileWithRetry(originalPath, pristine);
    fs.unlinkSync(backup);

    await Item.unscoped().update(
        { width: size.width, height: size.height, editedAt: null },
        { where: { id } },
    );

    return { ok: true, width: size.width, height: size.height };
}

module.exports = { editImage, revertImage };
