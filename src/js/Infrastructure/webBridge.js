/**
 * In a browser (phone / tablet over the home network) there is no Electron preload:
 * this builds the same `window.darkframe` bridge on top of the app's own server
 * (server/remote/server.js) — calls go over HTTP, pushed events come through
 * server-sent events, and the app's file URLs (library://, mangaimg://, …) are
 * served under /x/. The device and the config come from /boot.js, which the
 * server puts in front of the bundle. Does nothing inside the desktop app.
 */
const boot = window.__DF_WEB__;

if (!window.darkframe && boot) {
    const listeners = new Map();   // channel → Set(fn)
    const SCHEMES = /^(library|mangaimg|mediacache|fsthumb):\/\//;
    const HEADERS = { 'Content-Type': 'application/json', 'X-Darkframe': '1' };

    const appUrl = (u) => (typeof u === 'string' && SCHEMES.test(u)
        ? u.replace(SCHEMES, (m, s) => `${location.origin}/x/${s}/`)
        : u);

    async function post(path, body) {
        const r = await fetch(path, { method: 'POST', headers: HEADERS, body: JSON.stringify(body), credentials: 'same-origin' });
        if (r.status === 401) { location.reload(); throw new Error('Устройство отключено'); }
        const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        if (j.error) throw new Error(j.error);
        return j.result;
    }

    // Pushed events; EventSource reconnects by itself after a drop.
    let source = null;
    const status = { online: true };
    function connect() {
        source = new EventSource('/events');
        source.onmessage = (m) => {
            let msg;
            try { msg = JSON.parse(m.data); } catch { return; }
            if (msg.channel === 'remote:reload') { location.reload(); return; }
            (listeners.get(msg.channel) || []).forEach(fn => { try { fn(msg.payload); } catch (e) { console.error(e); } });
        };
        source.onopen = () => { status.online = true; document.documentElement.classList.remove('df-offline'); };
        source.onerror = () => { status.online = false; document.documentElement.classList.add('df-offline'); };
    }
    connect();

    // Windows-style paths of the PC, for code that splits / joins them.
    const sep = boot.sep || '\\';
    const parts = (p) => String(p || '').split(/[\\/]+/).filter(Boolean);
    const path = {
        sep,
        join: (...p) => p.filter(Boolean).join(sep).replace(/[\\/]+/g, sep),
        resolve: (...p) => path.join(...p),
        dirname: (p) => { const a = parts(p); a.pop(); return a.join(sep); },
        basename: (p, ext) => { const b = parts(p).pop() || ''; return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; },
        extname: (p) => { const b = parts(p).pop() || ''; const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
        isAbsolute: (p) => /^([a-z]:[\\/]|[\\/])/i.test(String(p || '')),
        parse: (p) => { const base = path.basename(p); const ext = path.extname(p); return { root: '', dir: path.dirname(p), base, ext, name: base.slice(0, base.length - ext.length) }; },
    };

    window.darkframe = {
        web: { device: boot.device, status },
        invoke: (channel, ...args) => post('/rpc', { channel, args }),
        send: (channel, ...args) => { post('/send', { channel, args }).catch(() => {}); },
        on: (channel, fn) => {
            if (!listeners.has(channel)) listeners.set(channel, new Set());
            listeners.get(channel).add(fn);
            return () => listeners.get(channel)?.delete(fn);
        },
        config: boot.config || { settings: {}, private: {} },
        sys: boot.sys || { homedir: '', platform: 'web', electron: null },
        path,
        fileUrl: () => '',
        isDir: () => false,
        pathForFile: () => '',
        appUrl,
        // A file from the device → the library (the PC keeps it).
        upload: async (file, { collectionId = null } = {}) => {
            const q = new URLSearchParams({ name: file.name || 'upload' });
            if (collectionId) q.set('collectionId', collectionId);
            const r = await fetch(`/upload?${q}`, { method: 'POST', headers: { 'X-Darkframe': '1' }, body: file, credentials: 'same-origin' });
            const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
            if (j.error) throw new Error(j.error);
            return j;
        },
    };
    document.documentElement.classList.add('df-web');
    if (matchMedia('(pointer: coarse)').matches) document.documentElement.classList.add('df-touch');
}
