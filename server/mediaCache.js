/**
 * Transparent media cache for remote (http/https) images and videos.
 *
 * The renderer rewrites remote URLs to `mediacache://media/?u=<encoded-url>`.
 * This handler downloads each unique URL exactly once to a temp folder and
 * serves all subsequent requests from disk — so the thumbnail, the modal image
 * and neighbour preloads all share a single download instead of re-fetching
 * (Chromium partitions its HTTP cache by request mode, which caused the same
 * file_url to be downloaded once in CORS mode and again in no-cors mode).
 *
 * The entire cache folder is wiped on app start and on quit, so nothing
 * persists between sessions.
 */

const { app, net, protocol } = require('electron');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const SCHEME    = 'mediacache';
const CACHE_DIR = path.join(app.getPath('temp'), 'darkframe-media-cache');

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

async function downloadToCache(realUrl, cachePath) {
    const res = await net.fetch(realUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`upstream ${res.status}`);

    const buf = Buffer.from(await res.arrayBuffer());
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

        try {
            const cachePath = await getCachedFile(realUrl);

            // Serve from file:// so the <video> element gets proper Range support.
            // Forward the Range header for seeking.
            const range = request.headers.get('range');
            const fileRes = await net.fetch(pathToFileURL(cachePath).toString(),
                range ? { headers: { range } } : undefined);

            // Copy headers and add CORS so canvas toDataURL() isn't tainted.
            const headers = new Headers(fileRes.headers);
            headers.set('Access-Control-Allow-Origin', '*');

            return new Response(fileRes.body, {
                status: fileRes.status,
                statusText: fileRes.statusText,
                headers,
            });
        } catch (e) {
            console.error('[mediaCache] failed for', realUrl, e.message);
            return new Response('cache error', { status: 502 });
        }
    });
}

/**
 * Wipe the cache folder.
 *
 * On Windows files that are still memory-mapped by the renderer (<video>,
 * <img>) or by in-flight streams can't be deleted, yielding EPERM/ENOTEMPTY.
 * `maxRetries`/`retryDelay` make Node retry those locks. Any leftover is wiped
 * on next startup (when no handles exist), so a failure here is harmless and logged quietly.
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
