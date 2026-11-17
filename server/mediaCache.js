/**
 * Transparent media cache for remote (http/https) images and videos.
 *
 * The renderer rewrites remote URLs to `mediacache://media/?u=<encoded-url>`; each
 * URL is downloaded once to a temp folder and served from disk, so the thumbnail,
 * the viewer and neighbour preloads share one download (Chromium's HTTP cache is
 * split by request mode and would fetch it twice). Wiped on start and on quit.
 */

const { app, net, protocol } = require('electron');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fileResponse } = require('./fileResponse');

const SCHEME    = 'mediacache';
// Per profile: every instance wipes its cache on start / quit, so two instances
// (e.g. a test one next to the real one) must never share the folder.
const CACHE_DIR = path.join(
    app.getPath('temp'),
    'darkframe-media-cache-' + require('crypto').createHash('sha1').update(app.getPath('userData')).digest('hex').slice(0, 8),
);

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';

// Dedup concurrent downloads of the same URL (thumb + modal fire near-simultaneously)
const inFlight = new Map();

function ensureDir() {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePathFor(url) {
    const hash = crypto.createHash('sha1').update(url).digest('hex');
    let ext = '';
    try {
        const clean = new URL(url).pathname.split('?')[0];
        ext = path.extname(clean).slice(0, 6); // keep ext so content-type sniffs correctly
    } catch { /* ignore */ }
    return path.join(CACHE_DIR, hash + ext);
}

// A response cut short (fewer bytes than announced) is fetched again, up to 3 times:
// otherwise the broken copy (a picture with a grey / green half) would be served
// for the whole session.
async function fetchWhole(realUrl, attempts = 3) {
    let last = null;
    for (let i = 1; i <= attempts; i++) {
        try {
            const res = await net.fetch(realUrl, { headers: { 'User-Agent': USER_AGENT } });
            if (!res.ok) throw new Error(`upstream ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            const encoded = /gzip|br|deflate/i.test(res.headers.get('content-encoding') || '');
            const expected = encoded ? 0 : Number(res.headers.get('content-length')) || 0;
            if (!expected || buf.length >= expected) return buf;
            last = new Error(`short download ${buf.length}/${expected}`);
        } catch (e) {
            last = e;
            if (/upstream 4\d\d/.test(e.message)) throw e;   // not there: no point retrying
        }
        if (i < attempts) await new Promise(r => setTimeout(r, 800 * i));
    }
    throw last;
}

async function downloadToCache(realUrl, cachePath) {
    const buf = await fetchWhole(realUrl);
    ensureDir();
    // Write atomically to avoid serving a half-written file to a parallel reader
    const tmp = cachePath + '.part';
    await fs.promises.writeFile(tmp, buf);
    await fs.promises.rename(tmp, cachePath);
    return cachePath;
}

async function getCachedFile(realUrl) {
    const cachePath = cachePathFor(realUrl);
    if (fs.existsSync(cachePath)) return cachePath;

    if (inFlight.has(cachePath)) return inFlight.get(cachePath);

    const promise = downloadToCache(realUrl, cachePath)
        .finally(() => inFlight.delete(cachePath));
    inFlight.set(cachePath, promise);
    return promise;
}

function registerProtocol() {
    protocol.handle(SCHEME, async (request) => {
        let realUrl;
        try {
            realUrl = decodeURIComponent(new URL(request.url).searchParams.get('u') || '');
        } catch {
            return new Response('bad request', { status: 400 });
        }
        if (!realUrl) return new Response('missing url', { status: 400 });

        // Only proxy real remote media — never file:// or other schemes (which would
        // otherwise let this handler read local files and serve them with CORS:*).
        try {
            const scheme = new URL(realUrl).protocol;
            if (scheme !== 'http:' && scheme !== 'https:') {
                return new Response('forbidden', { status: 403 });
            }
        } catch {
            return new Response('bad url', { status: 400 });
        }

        try {
            const cachePath = await getCachedFile(realUrl);

            // Range support for <video> seeking; CORS so canvas toDataURL() isn't tainted.
            return fileResponse(cachePath, request.headers.get('range'), { 'Access-Control-Allow-Origin': '*' });
        } catch (e) {
            console.error('[mediaCache] failed for', realUrl, e.message);
            return new Response('cache error', { status: 502 });
        }
    });
}

/**
 * Wipe the cache folder. On Windows files still held by the renderer (<video>, <img>)
 * can't be deleted (EPERM / ENOTEMPTY): retried a few times, and whatever is left
 * goes on the next start.
 */
function clearCache() {
    try {
        fs.rmSync(CACHE_DIR, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 100,
        });
    } catch (e) {
        // Expected when files are still locked at quit — next launch cleans up.
        console.debug('[mediaCache] clear deferred to next launch:', e.code || e.message);
    }
}

module.exports = { SCHEME, CACHE_DIR, registerProtocol, clearCache };
