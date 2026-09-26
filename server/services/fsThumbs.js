/**
 * Thumbnails for arbitrary files on disk (the Folders browser, folder preview tiles).
 * Generated once and cached as JPEG under `cacheDir`, keyed by path + size + mtime,
 * so an edited file gets a fresh thumb and an untouched one is served from disk.
 * Much cheaper for the renderer than decoding every full-size image into a canvas.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const ops = require('./ffmpegOps');
const { mediaKind } = require('./fsBrowser');

const DEFAULT_WIDTH = 360;

// The user's own files are always read into memory first and handed to sharp as a
// buffer: given a path, libvips keeps the file open (on Windows: locked) for a while,
// which would block renaming / deleting a photo while its folder is open here.
const readInput = (file) => fs.promises.readFile(file);

// Small FIFO limiter: a folder with hundreds of files must not start hundreds of
// sharp / ffmpeg jobs at once. Videos get a tighter lane — each spawns ffmpeg.
function limiter(max) {
    let active = 0;
    const queue = [];
    const next = () => {
        if (active >= max || !queue.length) return;
        active++;
        const { fn, resolve, reject } = queue.shift();
        fn().then(resolve, reject).finally(() => { active--; next(); });
    };
    return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}
const imageLane = limiter(4);
const videoLane = limiter(2);

const inFlight = new Map();   // same thumb requested twice at once → one job

function cacheKey(file, st, width) {
    return crypto.createHash('sha1')
        .update(`${path.resolve(file).toLowerCase()}|${st.size}|${Math.floor(st.mtimeMs)}|${width}`)
        .digest('hex');
}

async function renderImage(src, dst, width) {
    const resize = (input) => sharp(input, { failOn: 'none', pages: 1 })
        .rotate()
        .resize(width, width, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 78, mozjpeg: true })
        .toFile(dst);
    const input = await readInput(src);
    try {
        await resize(input);
    } catch (e) {
        const ext = path.extname(src).toLowerCase();
        if (ext !== '.heic' && ext !== '.heif') throw e;
        const jpeg = await heicConvert({ buffer: input, format: 'JPEG', quality: 0.8 });
        await resize(Buffer.from(jpeg));
    }
}

async function renderVideo(src, dst) {
    const { duration } = await ops.probe(src);
    const at = duration ? Math.min(duration * 0.1, 30) : 0;
    await ops.thumbAt(src, dst, at);
}

/**
 * Path of a cached thumbnail for `file` (generating it when needed), or null when
 * the file isn't media or can't be decoded.
 */
async function getThumb(file, cacheDir, width = DEFAULT_WIDTH) {
    const kind = mediaKind(file);
    if (kind === 'other') return null;

    let st;
    try { st = await fs.promises.stat(file); } catch { return null; }
    if (!st.isFile()) return null;

    width = Math.max(64, Math.min(1024, Math.round(width) || DEFAULT_WIDTH));
    const key = cacheKey(file, st, width);
    const dst = path.join(cacheDir, key.slice(0, 2), `${key}.jpg`);
    if (fs.existsSync(dst)) return dst;

    if (inFlight.has(key)) return inFlight.get(key);

    const job = (kind === 'video' ? videoLane : imageLane)(async () => {
        await fs.promises.mkdir(path.dirname(dst), { recursive: true });
        const tmp = `${dst}.${process.pid}.tmp.jpg`;
        try {
            if (kind === 'video') await renderVideo(file, tmp);
            else await renderImage(file, tmp, width);
            await fs.promises.rename(tmp, dst);
            return dst;
        } catch (e) {
            fs.promises.unlink(tmp).catch(() => {});
            console.warn('[fsThumbs] failed for', path.basename(file), '-', String(e.message).split('\n')[0]);
            return null;
        }
    }).finally(() => inFlight.delete(key));

    inFlight.set(key, job);
    return job;
}

// Full-resolution dimensions (images via sharp header, videos via ffprobe).
async function mediaInfo(file) {
    const kind = mediaKind(file);
    try {
        if (kind === 'video') {
            const { duration, width, height } = await ops.probe(file);
            return { width, height, duration };
        }
        if (kind !== 'other') {
            const m = await sharp(await readInput(file), { failOn: 'none' }).metadata();
            const rotated = m.orientation >= 5;   // EXIF 5-8 swap width / height
            return {
                width:  rotated ? m.height : m.width,
                height: rotated ? m.width : m.height,
                frames: m.pages || 1,
                format: m.format,
            };
        }
    } catch { /* unreadable header */ }
    return {};
}

module.exports = { getThumb, mediaInfo, cacheKey, DEFAULT_WIDTH };

// Keep the cache bounded: drop the least recently written thumbs above `maxBytes`.
async function pruneCache(cacheDir, maxBytes = 512 * 1024 * 1024) {
    const files = [];
    let total = 0;
    let buckets;
    try { buckets = await fs.promises.readdir(cacheDir); } catch { return { removed: 0, total: 0 }; }
    for (const b of buckets) {
        const dir = path.join(cacheDir, b);
        let names;
        try { names = await fs.promises.readdir(dir); } catch { continue; }
        for (const n of names) {
            const p = path.join(dir, n);
            try {
                const st = await fs.promises.stat(p);
                files.push({ p, size: st.size, t: st.mtimeMs });
                total += st.size;
            } catch { /* vanished */ }
        }
    }
    if (total <= maxBytes) return { removed: 0, total };
    files.sort((a, b) => a.t - b.t);
    let removed = 0;
    for (const f of files) {
        if (total <= maxBytes * 0.8) break;
        try { await fs.promises.unlink(f.p); total -= f.size; removed++; } catch { /* in use */ }
    }
    return { removed, total };
}

module.exports.pruneCache = pruneCache;
