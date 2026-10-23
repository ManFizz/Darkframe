const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { net } = require('electron');
const { importFile } = require('./services/importService');
const { checkMedia } = require('./services/mediaCheck');
const apiTokens = require('./apiTokens');

const PORT = 45678;
let server = null;

// Caps so a hostile/looping request can't exhaust memory or fill the disk.
const MAX_BODY_BYTES     = 64 * 1024 * 1024;         // JSON body (base64 media)
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;   // remote media download

// Content-Type → file extension, for media behind extensionless / query-string
// URLs (…/video.php?video=…) whose path says nothing about the format.
const CONTENT_TYPE_EXT = {
    'image/jpeg': '.jpg',  'image/jpg':  '.jpg',
    'image/png':  '.png',  'image/webp': '.webp',
    'image/gif':  '.gif',
    'video/mp4':  '.mp4',  'video/webm': '.webm',
    'video/quicktime': '.mov', 'video/x-matroska': '.mkv',
};

// Extensions we trust straight from the URL; anything else defers to Content-Type.
const MEDIA_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif',
    '.mp4', '.webm', '.avi', '.mkv', '.mov',
]);

function extFromContentType(contentType) {
    if (!contentType) return null;
    const type = contentType.split(';')[0].trim().toLowerCase();
    return CONTENT_TYPE_EXT[type] || null;
}

// Resolves with the response Content-Type (so the caller can pick a correct
// extension) and the announced size — once the file is fully on disk.
function downloadWithNet(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        let settled = false;
        let contentType = null;
        let expectedSize = null;

        const done = (err) => {
            if (settled) return;
            settled = true;
            if (err) {
                file.destroy();
                fs.unlink(destPath, () => {});
                reject(err);
            } else {
                // Only after the last bytes are flushed: reading earlier gets a cut file.
                file.end(() => resolve({ contentType, expectedSize }));
            }
        };

        const request = net.request({ url, method: 'GET', redirect: 'follow' });

        request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        request.setHeader('Accept', 'image/webp,image/apng,image/*,video/*,*/*;q=0.8');
        request.setHeader('Accept-Language', 'en-US,en;q=0.9');
        request.setHeader('Referer', new URL(url).origin + '/');

        request.on('response', (response) => {
            if (response.statusCode !== 200) {
                done(new Error(`HTTP ${response.statusCode}`));
                return;
            }
            contentType = response.headers['content-type'];
            if (Array.isArray(contentType)) contentType = contentType[0];
            const first = (h) => (Array.isArray(h) ? h[0] : h);
            // Content-Length is the size on the wire: only comparable when not compressed.
            if (!/gzip|br|deflate/i.test(first(response.headers['content-encoding']) || '')) {
                expectedSize = Number(first(response.headers['content-length'])) || null;
            }
            let received = 0;
            response.on('data', (chunk) => {
                received += chunk.length;
                if (received > MAX_DOWNLOAD_BYTES) {
                    request.abort();
                    done(new Error('File too large'));
                    return;
                }
                file.write(chunk);
            });
            response.on('end',  () => done(null));
            response.on('error', done);
        });

        request.on('error', done);
        setTimeout(() => { request.abort(); done(new Error('Download timeout')); }, 120000);
        request.end();
    });
}

// Up to 3 attempts, also when the file arrives broken (cut short, a picture with a
// grey / green half). `extOf(contentType)` names the type for the check.
async function downloadWithRetry(url, destPath, retries = 3, extOf = () => null) {
    let problem = null;
    for (let i = 0; i < retries; i++) {
        try {
            const { contentType, expectedSize } = await downloadWithNet(url, destPath);
            problem = await checkMedia(destPath, { expectedSize, ext: extOf(contentType) });
            if (!problem) return contentType;
            fs.rmSync(destPath, { force: true });
        } catch (e) {
            if (i === retries - 1) throw e;
            problem = e.message;
        }
        console.warn(`[API] Download attempt ${i + 1} failed: ${problem}`);
        if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
    throw new Error(`File keeps arriving broken (${retries} attempts): ${problem}`);
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        let done = false;
        const fail = (e) => { if (done) return; done = true; req.destroy(); reject(e); };

        req.on('data', chunk => {
            if (done) return;
            size += chunk.length;
            if (size > MAX_BODY_BYTES) { fail(new Error('Body too large')); return; }
            body += chunk;
        });
        req.on('end', () => {
            if (done) return;
            done = true;
            try { resolve(JSON.parse(body)); }
            catch { reject(new Error('Invalid JSON')); }
        });
        req.on('error', fail);
    });
}

function respond(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-DF-Token',
    });
    res.end(JSON.stringify(data));
}

// Token is presented as `Authorization: Bearer <token>` or `X-DF-Token: <token>`.
function extractToken(req) {
    const auth = req.headers['authorization'];
    if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
    const x = req.headers['x-df-token'];
    return typeof x === 'string' ? x.trim() : null;
}

// Gate a request behind a scope. Returns true when allowed; otherwise writes 401 and
// returns false. With auth disabled (token system off) everything passes.
function authorize(req, res, scope) {
    const ok = apiTokens.verify(extractToken(req), scope);
    if (!ok) {
        respond(res, 401, { error: 'unauthorized', requiredScope: scope });
        return false;
    }
    return true;
}

// Same, but any one of `scopes` will do.
function authorizeAny(req, res, scopes) {
    const token = extractToken(req);
    if (scopes.some(s => apiTokens.verify(token, s))) return true;
    respond(res, 401, { error: 'unauthorized', requiredScope: scopes.join(' | ') });
    return false;
}

// `createdAt` from a client: unix seconds (milliseconds are recognised too) or an ISO
// date. Anything unusable → undefined, and the file's own date is kept.
function parseCreatedAt(v) {
    if (v === undefined || v === null || v === '') return undefined;
    let n = typeof v === 'number' ? v : (/^\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v) : Date.parse(v) / 1000);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    if (n > 1e12) n /= 1000;   // milliseconds
    return Math.floor(n);
}

// The sound track of a video that comes without one (v.redd.it): the first of the
// candidate links that downloads is muxed into `videoPath`. Returns the path of the
// file to import — the muxed one, or the silent video when no candidate worked.
async function addAudioTrack(videoPath, audioUrls, tmpBase, cleanup) {
    for (const audioUrl of audioUrls) {
        const audioPath = `${tmpBase}.audio.download`;
        const muxed     = `${tmpBase}.muxed.mp4`;
        cleanup.push(audioPath, muxed);
        try {
            await downloadWithRetry(audioUrl, audioPath, 2, () => '.mp4');
            await require('./services/ffmpegOps').muxAudioVideo(videoPath, audioPath, muxed);
            return { filePath: muxed, audio: true };
        } catch (e) {
            console.warn(`[API] Audio track ${audioUrl} not used: ${e.message}`);
            fs.rmSync(audioPath, { force: true });
        }
    }
    return { filePath: videoPath, audio: false };
}

// Body: { url, sourceUrl?, tags?, collectionId?, title?, notes?, createdAt?, audioUrl? }
// `audioUrl` — a link (or a list of links to try in order) to a separate sound track.
async function handleAdd(req, res) {
    const body = await parseBody(req);
    const { url, sourceUrl, tags = [], collectionId = null, title, notes } = body;
    const createdAt = parseCreatedAt(body.createdAt);
    const audioUrls = (Array.isArray(body.audioUrl) ? body.audioUrl : [body.audioUrl])
        .filter(u => typeof u === 'string' && /^https?:\/\//i.test(u));

    if (!url) { respond(res, 400, { error: 'url is required' }); return; }

    const urlPath = new URL(url).pathname;
    const urlExt  = path.extname(urlPath).toLowerCase();
    // A media extension in the URL is only trusted if it's actually one we support;
    // otherwise (.php, no extension, …) we fall back to the Content-Type after download.
    const urlExtTrusted = MEDIA_EXTENSIONS.has(urlExt) ? urlExt : null;

    // Download to a neutral name first, then rename to the resolved extension so
    // importFile's extension-based mime detection sees the right type.
    const tmpBase = path.join(os.tmpdir(), `jsgallery_${Date.now()}`);
    const tmpDownload = `${tmpBase}.download`;

    const contentType = await downloadWithRetry(url, tmpDownload, 3, (ct) => urlExtTrusted || extFromContentType(ct));
    const ext = urlExtTrusted || extFromContentType(contentType) || '.jpg';
    const tmpPath = `${tmpBase}${ext}`;
    fs.renameSync(tmpDownload, tmpPath);
    const cleanup = [tmpPath];

    let result, audio = null;
    try {
        let filePath = tmpPath;
        if (audioUrls.length && /^\.(mp4|mov|webm|mkv)$/.test(ext)) {
            ({ filePath, audio } = await addAudioTrack(tmpPath, audioUrls, tmpBase, cleanup));
        }
        result = await importFile({
            origin:       'api',
            filePath,
            collectionId,
            tags,
            sourceUrl:    sourceUrl || url,
            overrides:    { title: title || path.basename(urlPath, urlExt) || 'media', notes: notes || '', createdAt },
        });
    } finally {
        for (const f of cleanup) fs.rmSync(f, { force: true });
    }

    if (result.skipped) {
        respond(res, 409, {
            ok: false, skipped: true, reason: 'duplicate',
            existingTitle: result.existingTitle,
            collectionName: result.collectionName,
        });
        return;
    }

    respond(res, 200, { ok: true, id: result.item.id, ...(audio === null ? {} : { audio }) });
}

async function handleAddBase64(req, res) {
    const body = await parseBody(req);
    const { base64, mimeType, sourceUrl, title } = body;
    const createdAt = parseCreatedAt(body.createdAt);

    if (!base64) { respond(res, 400, { error: 'base64 required' }); return; }

    // Only a supported mime type gives an extension; anything else is a 400.
    const ext = extFromContentType(mimeType);
    if (!ext) { respond(res, 400, { error: 'valid mimeType required' }); return; }

    const tmpPath = path.join(os.tmpdir(), `jsgallery_tg_${Date.now()}${ext}`);

    fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'));

    const result = await importFile({
        origin:       'api',
        filePath:     tmpPath,
        collectionId: null,
        tags:         [],
        sourceUrl:    sourceUrl || '',
        overrides:    { title: title || '', createdAt },
    });

    try { fs.unlinkSync(tmpPath); } catch {}

    if (result.skipped) {
        respond(res, 409, { ok: false, skipped: true, existingTitle: result.existingTitle });
        return;
    }

    respond(res, 200, { ok: true, id: result.item.id });
}

// Raw media bytes as the body, metadata as a URL-encoded JSON `meta` query param
// (unicode-safe, unlike headers). For files the browser downloaded itself: signed
// CDN links that expire or need the site's cookies.
async function handleAddStream(req, res) {
    const params = new URL('http://localhost' + req.url).searchParams;
    let meta = {};
    try { meta = JSON.parse(params.get('meta') || '{}'); } catch { /* keep {} */ }

    const {
        title = '', tags = [], notes = '',
        sourceUrl = '', collectionId = null, mimeType = '',
    } = meta;
    const createdAt = parseCreatedAt(meta.createdAt);

    // Extension: explicit mime from the client, then the request Content-Type,
    // then a video default (this path is video-oriented).
    const ext =
        extFromContentType(mimeType) ||
        extFromContentType(req.headers['content-type']) ||
        '.mp4';

    const tmpPath = path.join(os.tmpdir(), `jsgallery_stream_${Date.now()}${ext}`);

    // Stream the body to disk with backpressure and a hard size cap.
    try {
        await new Promise((resolve, reject) => {
            const file = fs.createWriteStream(tmpPath);
            let size = 0;
            let aborted = false;

            const abort = (err) => {
                if (aborted) return;
                aborted = true;
                file.destroy();
                fs.unlink(tmpPath, () => {});
                try { req.destroy(); } catch {}
                reject(err);
            };

            req.on('data', (chunk) => {
                if (aborted) return;
                size += chunk.length;
                if (size > MAX_DOWNLOAD_BYTES) { abort(new Error('File too large')); return; }
                if (!file.write(chunk)) req.pause();
            });
            file.on('drain', () => { if (!aborted) req.resume(); });
            req.on('end',   () => { if (!aborted) file.end(resolve); });
            req.on('error', (e) => abort(e));
            file.on('error', (e) => abort(e));
        });
    } catch (e) {
        respond(res, 400, { error: e.message });
        return;
    }

    if (!fs.existsSync(tmpPath) || fs.statSync(tmpPath).size === 0) {
        try { fs.unlinkSync(tmpPath); } catch {}
        respond(res, 400, { error: 'empty body' });
        return;
    }

    const result = await importFile({
        origin:       'api',
        filePath:     tmpPath,
        collectionId,
        tags:         Array.isArray(tags) ? tags : [],
        sourceUrl:    sourceUrl || '',
        overrides:    { title: title || 'media', notes: notes || '', createdAt },
    });

    try { fs.unlinkSync(tmpPath); } catch {}

    if (result.skipped) {
        respond(res, 409, {
            ok: false, skipped: true, reason: result.reason,
            existingTitle: result.existingTitle,
            collectionName: result.collectionName,
        });
        return;
    }

    respond(res, 200, { ok: true, id: result.item.id });
}

// Which of these source links are already in the library (trashed items included)?
// Body: { sourceUrls: [...] } → { ok, present: [...] } — the given links, as given.
// Reddit post links match by post id, whatever the host / slug / trailing slash.
async function handleHas(req, res) {
    const { sourceUrls } = await parseBody(req);
    if (!Array.isArray(sourceUrls)) { respond(res, 400, { error: 'sourceUrls (array) required' }); return; }
    if (sourceUrls.length > 1000) { respond(res, 400, { error: 'at most 1000 sourceUrls per request' }); return; }
    const present = await require('./services/sourceMatch').findPresentSources(sourceUrls);
    respond(res, 200, { ok: true, present });
}

async function handleRim(req, res) {
    const params = new URL('http://localhost' + req.url).searchParams;
    const docid  = params.get('docid');
    const text   = params.get('text') || '';
    const rimUrl = `https://yandex.ru/images-apphost/rim?docid=${docid}&lang=ru&text=${encodeURIComponent(text)}`;

    const request = net.request({ url: rimUrl, method: 'GET', redirect: 'follow' });
    request.setHeader('Referer',    'https://yandex.ru/images/');
    request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    request.setHeader('Accept',     'application/json');

    let body = '';
    request.on('response', (response) => {
        response.on('data',  chunk => body += chunk);
        response.on('end',   () => {
            try { respond(res, 200, JSON.parse(body)); }
            catch { respond(res, 500, { error: 'rim parse error' }); }
        });
        response.on('error', () => respond(res, 500, { error: 'rim fetch error' }));
    });
    request.on('error', () => respond(res, 500, { error: 'rim request error' }));
    request.end();
}

async function handleCollections(res) {
    const Collection  = require('./models/Collection');
    const collections = await Collection.findAll({ order: [['order', 'ASC']] });
    respond(res, 200, { ok: true, collections: collections.map(c => c.toJSON()) });
}

async function handleGetStats(res) {
    const Item       = require('./models/Item');
    const Collection = require('./models/Collection');
    const total        = await Item.count();                          // default scope: live only
    const uncategorized = await Item.count({ where: { collectionId: null } });
    respond(res, 200, { ok: true, total, uncategorized });
}

async function handleCreateCollection(req, res) {
    const body       = await parseBody(req);
    const { name, parentId = null } = body;
    if (!name) { respond(res, 400, { error: 'name required' }); return; }

    const Collection = require('./models/Collection');
    const maxOrder   = await Collection.max('order') || 0;
    const col        = await Collection.create({ name, parentId, order: maxOrder + 1 });
    respond(res, 200, { ok: true, collection: col.toJSON() });
}

// A gallery page of a manga source → the manga download queue. Body: { url, collectionId? }
async function handleManga(req, res) {
    const { url, collectionId = null } = await parseBody(req);
    const m = require('./services/manga/sources').matchUrl(String(url || ''));
    if (!m) { respond(res, 400, { error: 'not a gallery link of a known manga source' }); return; }
    const job = await require('./services/manga/downloads').enqueue({ source: m.source, id: m.id, collectionId });
    respond(res, 200, { ok: true, source: m.source, id: m.id, job: { id: job.id, status: job.status } });
}

// The browser userscript, built fresh from userscripts/ (its @updateURL points
// here, so Violentmonkey picks up edits on its next update check). No token: it's
// code, nothing private.
function handleUserscript(res) {
    const buildPath = path.join(__dirname, '..', 'userscripts', 'build.js');
    delete require.cache[require.resolve(buildPath)];
    const text = require(buildPath).build();
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(text);
}

async function handleRequest(req, res) {
    try {
        if (req.method === 'OPTIONS') { respond(res, 204, {}); return; }

        // Open handshake endpoint: no token needed, and it advertises whether auth is on
        // so a userscript can tell the user to configure a token.
        if (req.method === 'GET'  && req.url === '/api/ping') {
            respond(res, 200, { ok: true, version: '1.3', requireAuth: apiTokens.getConfig().requireAuth });
            return;
        }

        if (req.method === 'GET' && /^\/userscripts\/darkframe\.(user|meta)\.js(\?|$)/.test(req.url)) { handleUserscript(res); return; }

        if (req.method === 'POST' && req.url === '/api/add')                 { if (authorize(req, res, 'import'))      await handleAdd(req, res);        return; }
        if (req.method === 'POST' && req.url === '/api/addBase64')           { if (authorize(req, res, 'import'))      await handleAddBase64(req, res);  return; }
        if (req.method === 'POST' && req.url.startsWith('/api/addStream'))   { if (authorize(req, res, 'import'))      await handleAddStream(req, res);  return; }
        if (req.method === 'POST' && req.url === '/api/has')                 { if (authorizeAny(req, res, ['read', 'import'])) await handleHas(req, res); return; }
        if (req.method === 'POST' && req.url === '/api/manga')        { if (authorize(req, res, 'import'))      await handleManga(req, res);      return; }
        if (req.method === 'GET'  && req.url.startsWith('/api/rim?')) { if (authorize(req, res, 'rim'))         await handleRim(req, res);        return; }
        if (req.method === 'GET'  && req.url === '/api/collections')  { if (authorize(req, res, 'read'))        await handleCollections(res);     return; }
        if (req.method === 'GET'  && req.url === '/api/stats')        { if (authorize(req, res, 'read'))        await handleGetStats(res);        return; }
        if (req.method === 'POST' && req.url === '/api/collections')  { if (authorize(req, res, 'collections')) await handleCreateCollection(req, res); return; }

        respond(res, 404, { error: 'Not found' });
    } catch (e) {
        console.error('[API] Request error:', e.message);
        respond(res, 500, { error: e.message });
    }
}

function startApiServer() {
    if (server) return;

    server = http.createServer(handleRequest);
    server.listen(PORT, '127.0.0.1', () => {
        console.log(`[API] Server running on http://127.0.0.1:${PORT}`);
    });
    server.on('error', (e) => console.error('[API] Server error:', e.message));
}

function stopApiServer() {
    if (!server) return;
    server.close();
    server = null;
}

module.exports = { startApiServer, stopApiServer, PORT, handleRequest, parseCreatedAt };