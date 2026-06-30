/**
 * Import media from a direct URL.
 *
 * Direct media links (…/foo.jpg, …/clip.mp4) are downloaded with axios, written
 * to a temp file and handed to the existing importFile() pipeline (thumb/hash/DB
 * record), then the temp file is removed.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const axios = require('axios');
const { importFile } = require('./importService');

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

// `sourceUrl` lets callers store a different origin than the media link itself
// (e.g. the post page a favourite came from); it falls back to the media URL.
async function importDirectUrl({ url, collectionId, tags, sourceUrl, title, referer, onProgress }) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': USER_AGENT,
            ...(referer ? { Referer: referer } : {}),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        onDownloadProgress: (e) => {
            if (onProgress && e.total) {
                onProgress({ percent: Math.round((e.loaded / e.total) * 100) });
            }
        },
    });

    let ext = path.extname(new URL(url).pathname).split('?')[0].toLowerCase();
    if (!ext) ext = CONTENT_TYPE_EXT[(res.headers['content-type'] || '').split(';')[0]] || '.bin';

    const tmp = path.join(os.tmpdir(), `df-url-${Date.now()}${ext}`);
    fs.writeFileSync(tmp, Buffer.from(res.data));

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

module.exports = { importFromUrl };
