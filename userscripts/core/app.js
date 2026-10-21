// The Darkframe local API (server/apiServer.js).

const { gm } = require('./http');
const store = require('./store');

const API = 'http://127.0.0.1:45678';
const MIN_VERSION = 1.3;   // createdAt, /api/has, tags with categories, audioUrl

// Stops a whole run: the app is gone or the token is wrong.
class AppError extends Error {}

async function call(method, path, { body, raw, headers = {}, timeout = 60000 } = {}) {
    const token = store.token.get();
    const auth = token ? { Authorization: `Bearer ${token}` } : {};
    let r;
    try { r = await gm(method, API + path, { body, raw, headers: { ...auth, ...headers }, timeout }); }
    catch { throw new AppError('Darkframe не отвечает — приложение запущено?'); }
    if (r.status === 401) throw new AppError('Нет доступа к Darkframe: укажите токен со scope «import» (кнопка ⚙ или меню Violentmonkey).');
    return r;
}

// → null when the app is ready, else what's wrong (text).
async function check() {
    let ping;
    try { ping = await gm('GET', `${API}/api/ping`, { timeout: 5000 }); } catch { ping = null; }
    if (!ping || ping.status !== 200) return 'Darkframe не отвечает — приложение запущено?';
    if (ping.json?.version && Number(ping.json.version) < MIN_VERSION) return 'Darkframe слишком старый для этого скрипта: обновите приложение.';
    if (ping.json?.requireAuth && !store.token.get()) return 'Нужен токен Darkframe: нажмите ⚙ (или меню Violentmonkey → «Darkframe: указать токен»).';
    return null;
}

// Which of these source links the library already has → Set of them.
async function has(urls) {
    const present = new Set();
    for (let i = 0; i < urls.length; i += 200) {
        const r = await call('POST', '/api/has', { body: { sourceUrls: urls.slice(i, i + 200) } });
        if (r.status === 200) (r.json?.present || []).forEach(u => present.add(u));
    }
    return present;
}

const outcome = (r) => (r.status === 200 ? { result: 'saved' } : r.status === 409 ? { result: 'exists' }
    : { result: 'failed', error: r.json?.error || `HTTP ${r.status}` });

// The app downloads `fields.url` itself. Fields: url, audioUrl?, sourceUrl, title,
// notes?, tags? (names or { name, type }), createdAt?, collectionId?
async function add(fields) {
    return outcome(await call('POST', '/api/add', { body: fields, timeout: 10 * 60 * 1000 }));
}

// The browser already has the bytes (the site won't give them to the app).
// A Blob, not the bare ArrayBuffer: Tampermonkey sends a bare one as the text
// "[object ArrayBuffer]".
async function addBytes(fields, bytes, mimeType) {
    const meta = encodeURIComponent(JSON.stringify({ ...fields, mimeType }));
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mimeType });
    return outcome(await call('POST', `/api/addStream?meta=${meta}`, {
        raw: blob, headers: { 'Content-Type': mimeType }, timeout: 10 * 60 * 1000,
    }));
}

// → the new collection { id, name }, or throws with what's wrong.
async function createCollection(name) {
    let r;
    try { r = await call('POST', '/api/collections', { body: { name } }); }
    catch (e) {
        if (/^Нет доступа/.test(e.message)) throw new Error('Нужен токен со scope «collections»');
        throw e;
    }
    if (r.status === 200 && r.json?.collection) return r.json.collection;
    throw new Error(r.json?.error || `HTTP ${r.status}`);
}

// → [{ id, name, depth }] in tree order, or null without the "read" scope.
async function collections() {
    let r;
    try { r = await call('GET', '/api/collections'); } catch { return null; }
    if (r.status !== 200) return null;
    const byParent = new Map();
    for (const c of r.json?.collections || []) {
        const k = c.parentId || '';
        (byParent.get(k) || byParent.set(k, []).get(k)).push(c);
    }
    const out = [];
    const walk = (parent, depth) => {
        for (const c of byParent.get(parent) || []) { out.push({ id: c.id, name: c.name, depth }); walk(c.id, depth + 1); }
    };
    walk('', 0);
    return out;
}

module.exports = { API, AppError, check, has, add, addBytes, createCollection, collections };
