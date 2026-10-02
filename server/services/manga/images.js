const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('./http');
const sources = require('./sources');

/**
 * Pages of online manga, fetched by the main process and kept in a disk cache:
 * the reader shows them through mangaimg:// URLs, the downloader takes the same
 * files — a chapter read online isn't downloaded twice when saved.
 *
 *   mangaimg://p/?s=<source>&u=<url>&r=1   (r=1: url is a viewer page to resolve)
 */
let cacheDirOverride = null;
const cacheDir = () => cacheDirOverride || path.join(require('electron').app.getPath('userData'), 'cache', 'manga');
const setCacheDir = (d) => { cacheDirOverride = d; index = null; };

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
const inFlight = new Map();

const keyOf = (source, url) => crypto.createHash('sha1').update(`${source}\n${url}`).digest('hex');

// key → file name, read from the folder once.
let index = null;
function cached(source, url) {
    if (!index) {
        index = new Map();
        try { fs.readdirSync(cacheDir()).forEach(n => { if (!n.endsWith('.part')) index.set(n.slice(0, 40), n); }); } catch { /* empty */ }
    }
    const n = index.get(keyOf(source, url));
    if (!n) return null;
    const f = path.join(cacheDir(), n);
    if (fs.existsSync(f)) return f;
    index.delete(keyOf(source, url));
    return null;
}

function extOf(type, url) {
    const t = String(type || '').split(';')[0].trim().toLowerCase();
    if (EXT[t]) return EXT[t];
    const m = String(url).split('?')[0].match(/\.(jpe?g|png|webp|gif|avif)$/i);
    return m ? `.${m[1].toLowerCase().replace('jpeg', 'jpg')}` : '.jpg';
}

async function download(source, url, resolve) {
    const src = sources.get(source);
    let req;
    if (resolve && src.resolveImage) req = await src.resolveImage(url);
    else req = src.imageRequest ? src.imageRequest(url) : { url };
    let res;
    try {
        res = await http.buffer(req.url, { referer: req.referer });
    } catch (e) {
        // e-hentai: that image server failed — ask the viewer page for another one.
        if (!req.retry || !src.resolveImage) throw e;
        const again = await src.resolveImage(url, req.retry);
        res = await http.buffer(again.url, { referer: again.referer });
    }
    if (!res.buf.length) throw new Error('пустой ответ');
    const dir = cacheDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, keyOf(source, url) + extOf(res.type, req.url));
    fs.writeFileSync(`${file}.part`, res.buf);
    fs.renameSync(`${file}.part`, file);
    if (index) index.set(keyOf(source, url), path.basename(file));
    return file;
}

// Local file of a page (downloaded once, then from the cache).
function fetchImage(source, url, { resolve = false } = {}) {
    const hit = cached(source, url);
    if (hit) return Promise.resolve(hit);
    const k = keyOf(source, url);
    if (inFlight.has(k)) return inFlight.get(k);
    const p = download(source, url, resolve).finally(() => inFlight.delete(k));
    inFlight.set(k, p);
    return p;
}

const pageUrl = (source, p) =>
    `mangaimg://p/?s=${encodeURIComponent(source)}&u=${encodeURIComponent(p.url)}${p.resolve ? '&r=1' : ''}`;

// Reader-ready pages: every image through mangaimg://.
const toReaderPages = (source, pages) => (pages || []).map(p => ({
    url: pageUrl(source, p),
    thumb: p.thumb ? pageUrl(source, { url: p.thumb }) : null,
    w: p.w || 0,
    h: p.h || 0,
    src: p.url,
    resolve: !!p.resolve,
}));

// Old cache files go after a week; the cache never grows past ~2 GB.
function pruneCache({ maxAgeDays = 7, maxBytes = 2 * 1024 ** 3 } = {}) {
    let files;
    try { files = fs.readdirSync(cacheDir()).map(n => { const f = path.join(cacheDir(), n); const st = fs.statSync(f); return { f, t: st.mtimeMs, s: st.size }; }); }
    catch { return; }
    const old = Date.now() - maxAgeDays * 86400000;
    let total = 0;
    files.sort((a, b) => b.t - a.t).forEach(x => {
        total += x.s;
        if (x.t < old || total > maxBytes) fs.rmSync(x.f, { force: true });
    });
    index = null;
}

module.exports = { fetchImage, toReaderPages, pageUrl, pruneCache, setCacheDir, cacheDir };
