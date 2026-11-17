const http = require('./http');

/**
 * A page loaded the way a browser loads it — a hidden window in the manga session,
 * with the site's own scripts. For sites where a plain request isn't enough (the
 * sign-in state lives in what the page's scripts set up). Images aren't loaded.
 *
 * Returns { html, url, value, requests } — value: the result of `script` run on
 * the page `settle` ms after it loaded; requests (trackRequests): the page's own
 * XHR / fetch calls { type, url, status }. Outside Electron (tests) → null.
 */
async function loadPage(url, { referrer = null, script = null, settle = 0, timeout = 40000, trackRequests = false } = {}) {
    let BrowserWindow;
    try { ({ BrowserWindow } = require('electron')); } catch { return null; }
    if (typeof BrowserWindow !== 'function') return null;

    const win = new BrowserWindow({
        show: false,
        webPreferences: { partition: http.PARTITION, sandbox: true, contextIsolation: true, images: false, backgroundThrottling: false },
    });
    win.webContents.setAudioMuted(true);
    win.webContents.setUserAgent(http.UA());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    let timer;
    const requests = [];
    const ses = win.webContents.session;
    if (trackRequests) {
        ses.webRequest.onCompleted((d) => {
            if (d.webContentsId === win.webContents.id && (d.resourceType === 'xhr' || d.resourceType === 'fetch' || d.resourceType === 'mainFrame'))
                requests.push({ type: d.resourceType, url: d.url, status: d.statusCode });
        });
    }
    try {
        // The document is enough (the data sits in its inline scripts) — no waiting
        // for every ad and counter. A redirect "aborts" the first load; the
        // final page still comes and fires its own dom-ready.
        const ready = new Promise(resolve => win.webContents.once('dom-ready', resolve));
        const loading = win.loadURL(url, referrer ? { httpReferrer: referrer } : undefined).catch(e => { if (e.code !== 'ERR_ABORTED') throw e; return new Promise(() => {}); });
        await Promise.race([
            ready,
            loading,
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Сайт не ответил вовремя')), timeout); }),
        ]);
        if (settle) await new Promise(r => setTimeout(r, settle));
        const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML');
        const value = script ? await win.webContents.executeJavaScript(script).catch(() => null) : null;
        return { html, url: win.webContents.getURL(), value, requests };
    } finally {
        clearTimeout(timer);
        if (trackRequests) ses.webRequest.onCompleted(null);
        if (!win.isDestroyed()) win.destroy();
    }
}

module.exports = { loadPage };
