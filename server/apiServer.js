const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { net } = require('electron');
const { importFile } = require('./services/importService');

const PORT = 45678;
let server = null;

function downloadWithNet(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        let settled = false;

        const done = (err) => {
            if (settled) return;
            settled = true;
            file.close();
            if (err) {
                fs.unlink(destPath, () => {});
                reject(err);
            } else {
                resolve();
            }
        };

        const request = net.request({ url, method: 'GET', redirect: 'follow' });

        request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        request.setHeader('Accept', 'image/webp,image/apng,image/*,*/*;q=0.8');
        request.setHeader('Accept-Language', 'en-US,en;q=0.9');
        request.setHeader('Referer', new URL(url).origin + '/');

        request.on('response', (response) => {
            if (response.statusCode !== 200) {
                done(new Error(`HTTP ${response.statusCode}`));
                return;
            }
            response.on('data', (chunk) => file.write(chunk));
            response.on('end',  () => done(null));
            response.on('error', done);
        });

        request.on('error', done);
        setTimeout(() => { request.abort(); done(new Error('Download timeout')); }, 120000);
        request.end();
    });
}

async function downloadWithRetry(url, destPath, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await downloadWithNet(url, destPath);
            return;
        } catch (e) {
            console.warn(`[API] Download attempt ${i + 1} failed: ${e.message}`);
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data',  chunk => body += chunk);
        req.on('end',   () => {
            try { resolve(JSON.parse(body)); }
            catch { reject(new Error('Invalid JSON')); }
        });
        req.on('error', reject);
    });
}

function respond(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
}

async function handleAdd(req, res) {
    const body = await parseBody(req);
    const { url, sourceUrl, tags = [], collectionId = null, title, notes } = body;

    if (!url) { respond(res, 400, { error: 'url is required' }); return; }

    const urlPath = new URL(url).pathname;
    const ext     = path.extname(urlPath).toLowerCase() || '.jpg';
    const tmpPath = path.join(os.tmpdir(), `jsgallery_${Date.now()}${ext}`);

    await downloadWithRetry(url, tmpPath);

    const result = await importFile({
        filePath:     tmpPath,
        collectionId,
        tags,
        sourceUrl:    sourceUrl || url,
        overrides:    { title: title || path.basename(urlPath, ext), notes: notes || '' },
    });

    try { fs.unlinkSync(tmpPath); } catch {}

    if (result.skipped) {
        respond(res, 409, {
            ok: false, skipped: true, reason: 'duplicate',
            existingTitle: result.existingTitle,
            collectionName: result.collectionName,
        });
        return;
    }

    respond(res, 200, { ok: true, id: result.item.id });
}

async function handleAddBase64(req, res) {
    const body = await parseBody(req);
    const { base64, mimeType, sourceUrl, title } = body;

    if (!base64) { respond(res, 400, { error: 'base64 required' }); return; }

    const ext     = '.' + mimeType.split('/')[1].replace('jpeg', 'jpg');
    const tmpPath = path.join(os.tmpdir(), `jsgallery_tg_${Date.now()}${ext}`);

    fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'));

    const result = await importFile({
        filePath:     tmpPath,
        collectionId: null,
        tags:         [],
        sourceUrl:    sourceUrl || '',
        overrides:    { title: title || '' },
    });

    try { fs.unlinkSync(tmpPath); } catch {}

    if (result.skipped) {
        respond(res, 409, { ok: false, skipped: true, existingTitle: result.existingTitle });
        return;
    }

    respond(res, 200, { ok: true, id: result.item.id });
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
    const total        = await Item.count();
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

async function handleRequest(req, res) {
    try {
        if (req.method === 'OPTIONS') { respond(res, 204, {}); return; }

        if (req.method === 'GET'  && req.url === '/api/ping')              { respond(res, 200, { ok: true, version: '1.0' }); return; }
        if (req.method === 'POST' && req.url === '/api/add')               { await handleAdd(req, res);        return; }
        if (req.method === 'POST' && req.url === '/api/addBase64')         { await handleAddBase64(req, res);  return; }
        if (req.method === 'GET'  && req.url.startsWith('/api/rim?'))      { await handleRim(req, res);        return; }
        if (req.method === 'GET'  && req.url === '/api/collections')       { await handleCollections(res);     return; }
        if (req.method === 'GET' && req.url === '/api/stats')              { await handleGetStats(res); return; }
        if (req.method === 'POST' && req.url === '/api/collections')       { await handleCreateCollection(req, res); return; }

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

    process.on('uncaughtException', (e) => console.error('[API] Uncaught exception:', e.message));
}

function stopApiServer() {
    if (!server) return;
    server.close();
    server = null;
}

module.exports = { startApiServer, stopApiServer, PORT };