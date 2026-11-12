/**
 * Import media from a direct URL.
 *
 * Direct media links (…/foo.jpg, …/clip.mp4) are downloaded with Electron's
 * net.fetch — Chromium's network stack, the same way the window loads these sites
 * (system proxy / VPN, the per-host User-Agent and Referer rules of main.js); a
 * plain Node request took another route and timed out where the window worked —
 * streamed to a temp file, checked to be whole (re-downloaded up to 3 times if not) and
 * handed to the existing importFile() pipeline (thumb/hash/DB record), then the
 * temp file is removed.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { once } = require('events');
const { net } = require('electron');
const { importFile } = require('./importService');
const { checkMedia } = require('./mediaCheck');

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';

const DIRECT_MEDIA_RE = /\.(jpe?g|png|webp|gif|jfif|mp4|webm|avi|mov|mkv)(\?.*)?$/i;

const CONTENT_TYPE_EXT = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'image/gif': '.gif',  'video/mp4': '.mp4', 'video/webm': '.webm',
};

function wrapResult(result, url) {
    if (!result) return { results: [], skipped: [], errors: [{ url, error: 'no result' }] };
    if (result.skipped) return { results: [], skipped: [result], errors: [] };
    return { results: [result.item], skipped: [], errors: [] };
}

const ATTEMPTS = 3;

// One download into a temp file. → { file, expectedSize }. A 4xx answer throws an
// error with `status` (no point retrying); a dropped connection throws mid-way.
async function download(url, referer, onProgress) {
    // Danbooru: the session's cookies (Cloudflare clearance, see danbooruAccess), as
    // the window and netController send them.
    const credentials = /(^|\.)donmai\.us$/.test(new URL(url).hostname) ? 'include' : 'omit';
    const res = await net.fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...(referer ? { Referer: referer } : {}) },
        redirect: 'follow',
        credentials,
    });
    if (!res.ok) {
        const e = new Error(`HTTP ${res.status}`);
        e.status = res.status;
        throw e;
    }

    let ext = path.extname(new URL(url).pathname).split('?')[0].toLowerCase();
    if (!ext) ext = CONTENT_TYPE_EXT[(res.headers.get('content-type') || '').split(';')[0]] || '.bin';

    const file = path.join(os.tmpdir(), `df-url-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const out = fs.createWriteStream(file);
    let loaded = 0;
    try {
        const reader = res.body.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            loaded += value.length;
            if (!out.write(Buffer.from(value))) await once(out, 'drain');
            if (onProgress && total) onProgress({ percent: Math.min(100, Math.round((loaded / total) * 100)) });
        }
        await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    } catch (e) {
        out.destroy();
        fs.rmSync(file, { force: true });
        throw e;
    }
    // Content-Length is the size on the wire: only comparable when not compressed.
    const encoded = /gzip|br|deflate/i.test(res.headers.get('content-encoding') || '');
    return { file, expectedSize: encoded ? null : total || null };
}

/**
 * Downloads `url` until a whole file arrives (sites sometimes send a broken copy —
 * a picture with a grey / green half, a video cut short): up to 3 attempts.
 * → the temp file; throws when every attempt came out broken.
 */
async function downloadWhole(url, { referer, onProgress, attempts = ATTEMPTS, pause = 1200 } = {}) {
    let problem = null;
    let network = false;   // the last attempt failed to download at all (vs. arrived broken)
    for (let i = 1; i <= attempts; i++) {
        let got = null;
        try {
            got = await download(url, referer, onProgress);
            problem = await checkMedia(got.file, { expectedSize: got.expectedSize });
            network = false;
            if (!problem) return got.file;
        } catch (e) {
            if (e.status >= 400 && e.status < 500) throw e;   // not there: no point retrying
            problem = e.message;
            network = true;
        }
        if (got && fs.existsSync(got.file)) fs.unlinkSync(got.file);
        console.warn(`[urlImport] attempt ${i}/${attempts} for ${url}: ${problem}`);
        if (i < attempts) await new Promise(r => setTimeout(r, pause * i));
    }
    throw new Error(network
        ? `Не удалось скачать файл целиком (${attempts} попытки): сайт не отдаёт его — ${problem}`
        : `Не удалось скачать файл целиком — каждый раз приходит повреждённым (${attempts} попытки): ${problem}`);
}

// `sourceUrl` lets callers store a different origin than the media link itself
// (e.g. the post page a favourite came from); it falls back to the media URL.
async function importDirectUrl({ url, collectionId, tags, sourceUrl, title, referer, onProgress }) {
    const tmp = await downloadWhole(url, { referer, onProgress });
    const origin = sourceUrl || url;
    try {
        const result = await importFile({
            filePath: tmp,
            collectionId,
            tags,
            sourceUrl: origin,
            overrides: { sourceUrl: origin, title: title || undefined },
        });
        return wrapResult(result, url);
    } finally {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
}

async function importFromUrl({ url, collectionId = null, tags = [], sourceUrl, title, referer, onProgress } = {}) {
    url = (url || '').trim();
    if (!url) return { results: [], skipped: [], errors: [{ url, error: 'empty url' }] };

    if (!DIRECT_MEDIA_RE.test(url)) {
        return {
            results: [], skipped: [],
            errors: [{ url, error: 'Поддерживаются только прямые ссылки на медиа (.jpg, .png, .mp4, .webm и т.п.)' }],
        };
    }

    try {
        return await importDirectUrl({ url, collectionId, tags, sourceUrl, title, referer, onProgress });
    } catch (e) {
        console.error('[urlImport] failed for', url, e);
        return { results: [], skipped: [], errors: [{ url, error: e.message }] };
    }
}

module.exports = { importFromUrl, downloadWhole };
