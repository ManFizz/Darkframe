const { BrowserWindow, app, session } = require('electron');

/**
 * Danbooru sits behind Cloudflare. Depending on the network (VPN exits, flagged IPs)
 * every request — API included — may get a "Just a moment…" challenge instead of
 * data, and no login / API key helps with that. The way through is the same as in
 * a browser: open the site once, let the person pass the check, keep the
 * cf_clearance cookie. The cookie is bound to the browser's User-Agent, so while
 * it exists the API requests present that same UA.
 *
 * The check itself is done by the person in the window; the app only waits for
 * the cookie to appear.
 */
const DANBOORU = 'https://danbooru.donmai.us/posts?limit=1';
let clearance = false;
let verifyWcId = null;
let pending = null;

// A plain Chrome UA for this Chromium — the same string in the check window and
// in API requests (the clearance cookie is bound to it).
const chromeUA = () =>
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

// Still on Cloudflare's page? (the cookie alone isn't proof: it can be set before
// the check is actually passed)
const STILL_CHECKING = `(() => /just a moment|один момент|attention required/i.test(document.title)
    || !!document.querySelector('#challenge-form, .cf-turnstile, [name="cf-turnstile-response"], script[src*="challenge-platform"]'))()`;

const isClearance = (cookie) => cookie.name === 'cf_clearance' && /(^|\.)donmai\.us$/.test(cookie.domain.replace(/^\./, ''));

async function hasClearanceCookie() {
    const cookies = await session.defaultSession.cookies.get({ domain: 'donmai.us' });
    return cookies.some(isClearance);
}

async function init() {
    clearance = await hasClearanceCookie().catch(() => false);
    session.defaultSession.cookies.on('changed', (_e, cookie, _cause, removed) => {
        if (isClearance(cookie)) clearance = !removed;
    });
}

// User-Agent for a request to *.donmai.us (see main.js setupRequestHeaders).
function userAgentFor(details) {
    if (clearance || (verifyWcId != null && details.webContentsId === verifyWcId)) return chromeUA();
    // Without a clearance cookie an API client that names itself gets through
    // more often than a browser-looking one.
    return `Darkframe/${app.getVersion()}`;
}

// Opens Danbooru in a small window for the person to pass the check. Resolves
// true once the clearance cookie is there, false if the window is closed first.
function verify(parent) {
    if (pending) return pending;
    pending = new Promise((resolve) => {
        const win = new BrowserWindow({
            parent,
            width: 520,
            height: 680,
            title: 'Danbooru — проверка Cloudflare',
            autoHideMenuBar: true,
            webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        });
        verifyWcId = win.webContents.id;
        win.webContents.setUserAgent(chromeUA());
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        win.webContents.on('will-navigate', (e, url) => {
            if (!/^https:\/\/([a-z0-9-]+\.)?donmai\.us\//i.test(url)) e.preventDefault();
        });

        let done = false;
        const finish = (ok) => {
            if (done) return;
            done = true;
            clearInterval(poll);
            clearTimeout(timeout);
            verifyWcId = null;
            pending = null;
            if (!win.isDestroyed()) win.close();
            resolve(ok);
        };
        const poll = setInterval(async () => {
            if (win.isDestroyed() || win.webContents.isLoading()) return;
            const checking = await win.webContents.executeJavaScript(STILL_CHECKING).catch(() => true);
            if (!checking && await hasClearanceCookie().catch(() => false)) {
                clearance = true;
                finish(true);
            }
        }, 1000);
        const timeout = setTimeout(() => finish(false), 5 * 60 * 1000);
        win.on('closed', () => finish(false));
        win.loadURL(DANBOORU).catch(() => {});
    });
    return pending;
}

module.exports = { init, userAgentFor, verify, hasClearance: () => clearance };
