const { ipcMain, net } = require('electron');

/**
 * Network requests of the page, made from the main process. The window runs with
 * webSecurity on, so it can't read cross-origin responses (booru APIs send no CORS
 * headers); the page asks here instead (see src/js/Infrastructure/http.js).
 *
 * net.fetch goes through the default session, so the per-host User-Agent /
 * Referer rules from main.js apply. Only http(s) — plus local media files for the
 * animated image player — can be fetched.
 */
const inFlight = new Map();   // request id → AbortController
const LOCAL_MEDIA = /\.(gif|webp|png|apng|jpe?g|avif)$/i;

function allowed(url) {
    let u;
    try { u = new URL(url); } catch { return false; }
    if (u.protocol === 'http:' || u.protocol === 'https:') return true;
    // Local animations (Folders viewer): media files only, never arbitrary files.
    return u.protocol === 'file:' && LOCAL_MEDIA.test(decodeURIComponent(u.pathname)) && !u.pathname.includes('..');
}

function register() {
    ipcMain.handle('net:fetch', async (_, { id, url, method = 'GET', headers = {}, as = 'text' }) => {
        if (!allowed(url)) return { error: 'URL не разрешён' };
        const ctl = new AbortController();
        if (id) inFlight.set(id, ctl);
        try {
            const res = await net.fetch(url, { method, headers, signal: ctl.signal });
            const body = as === 'binary'
                ? new Uint8Array(await res.arrayBuffer())
                : await res.text();
            return {
                ok: res.ok,
                status: res.status,
                statusText: res.statusText,
                headers: Object.fromEntries(res.headers.entries()),
                body,
            };
        } catch (e) {
            return { error: e.name === 'AbortError' ? 'aborted' : e.message };
        } finally {
            if (id) inFlight.delete(id);
        }
    });

    ipcMain.on('net:abort', (_, id) => inFlight.get(id)?.abort());
}

module.exports = { register, allowed };
