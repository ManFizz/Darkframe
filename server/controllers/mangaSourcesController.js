const { ipcMain, BrowserWindow } = require('electron');
const { Op } = require('sequelize');
const sources = require('../services/manga/sources');
const images = require('../services/manga/images');
const downloads = require('../services/manga/downloads');
const http = require('../services/manga/http');
const { MANGA_MIME } = require('../services/manga/store');
const { Item } = require('../models/associations');
const MangaDownload = require('../models/MangaDownload');
const subscriptions = require('../services/manga/subscriptions');

/**
 * IPC for online manga: sources, search, a gallery card, chapters for online
 * reading (pages through mangaimg://), the download queue and the site window
 * (sign-in / Cloudflare check) in the manga session.
 */
const winOf = (event) => BrowserWindow.fromWebContents(event.sender);

// source:id → library item id, for "already in the library" marks.
async function libraryIndex() {
    const rows = await Item.findAll({
        where: { mimeType: MANGA_MIME, sourceUrl: { [Op.ne]: '' } },
        attributes: ['id', 'sourceUrl'],
        raw: true,
    });
    const map = new Map();
    rows.forEach(r => { const k = sources.keyOfUrl(r.sourceUrl); if (k && !map.has(k)) map.set(k, r.id); });
    return map;
}

async function activeDownloads() {
    const rows = await MangaDownload.findAll({ where: { status: ['queued', 'running', 'paused'] }, attributes: ['source', 'galleryId', 'status'], raw: true });
    return new Map(rows.map(r => [sources.keyOf(r.source, r.galleryId), r.status]));
}

const coverUrl = (source, url) => (url ? images.pageUrl(source, { url }) : null);

async function mark(source, items) {
    const [lib, dl] = await Promise.all([libraryIndex(), activeDownloads()]);
    return items.map(i => {
        const k = sources.keyOf(source, i.id);
        return { ...i, cover: coverUrl(source, i.cover), inLibrary: lib.get(k) || null, downloading: dl.get(k) || null };
    });
}

let siteWin = null;

const { siteLog, bare } = require('../services/manga/siteLog');

// A site page in the manga session: sign-in (AllHentai), a Cloudflare check.
// `onPage(win)` runs after every page load; returning true closes the window
// (e.g. the sign-in is done). Resolves when the window is closed.
function openSiteWindow(parent, url, title, { referrer = null, onPage = null } = {}) {
    const load = (w) => w.loadURL(url, referrer ? { httpReferrer: referrer } : undefined).catch(() => {});
    if (siteWin && !siteWin.isDestroyed()) {
        siteWin.onPage = onPage;
        load(siteWin);
        siteWin.focus();
        return siteWin.closedPromise;
    }
    const win = new BrowserWindow({
        parent,
        width: 1000,
        height: 760,
        title,
        autoHideMenuBar: true,
        webPreferences: { partition: http.PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.onPage = onPage;
    win.webContents.setUserAgent(http.UA());
    // Pop-ups (OAuth etc.) open in the same window instead of new ones.
    win.webContents.setWindowOpenHandler(({ url: u }) => {
        if (/^https?:\/\//i.test(u)) win.loadURL(u).catch(() => {});
        return { action: 'deny' };
    });
    siteLog(`open ${bare(url)}`);
    win.webContents.on('did-navigate', (e, u, code) => siteLog(`nav ${code} ${bare(u)}`));
    win.webContents.on('did-redirect-navigation', (e, u) => siteLog(`redirect ${bare(u)}`));
    win.webContents.on('did-fail-load', (e, code, desc, u, main) => { if (main) siteLog(`fail ${code} ${desc} ${bare(u)}`); });
    win.webContents.on('did-finish-load', async () => {
        if (!win.onPage || win.isDestroyed()) return;
        try { if (await win.onPage(win)) win.close(); } catch { /* page went away */ }
    });
    win.closedPromise = new Promise(resolve => win.on('closed', async () => {
        siteWin = null;
        try {
            const all = await require('electron').session.fromPartition(http.PARTITION).cookies.get({});
            const byHost = {};
            all.forEach(c => { (byHost[c.domain] ||= []).push(c.name); });
            siteLog(`closed; cookies: ${Object.entries(byHost).map(([d, n]) => `${d}[${n.join(',')}]`).join(' ')}`);
        } catch { /* ignore */ }
        resolve(true);
    }));
    load(win);
    siteWin = win;
    return win.closedPromise;
}

function register() {
    try {
        const ses = require('electron').session.fromPartition(http.PARTITION);
        ses.setUserAgent(http.UA());
        ses.on('will-download', (e) => e.preventDefault());
    } catch { /* ignore */ }

    ipcMain.handle('manga:sources', () => sources.describe());

    ipcMain.handle('manga:suggest', async (_, { source, text = '', type = null }) => {
        const src = sources.get(source);
        if (!src.suggest) return [];
        const list = await src.suggest(text, { type });
        return list.map(x => (x.kind === 'gallery' ? { ...x, cover: coverUrl(source, x.cover) } : x));
    });
    ipcMain.handle('manga:browseTags', async (_, { source, type, page = 1, sort = 'popular' }) => {
        const src = sources.get(source);
        return src.browseTags ? src.browseTags(type, { page, sort }) : { items: [], page: 1, pages: 1, hasMore: false };
    });
    ipcMain.handle('manga:loginState', async (_, { source }) => {
        const src = sources.get(source);
        return src.checkLogin ? src.checkLogin().catch(() => null) : null;
    });

    ipcMain.handle('manga:search', async (_, { source, query = '', page = 1, sort = null, next = null, filters = [] }) => {
        const src = sources.get(source);
        // A pasted gallery link goes straight to the card.
        const link = sources.matchUrl(query.trim());
        if (link && /^https?:\/\//i.test(query.trim())) return { open: link, items: [], hasMore: false };
        const res = await src.search({ query, page, sort: sort || src.sorts?.[0]?.id, next, filters });
        return { ...res, items: await mark(source, res.items || []) };
    });

    ipcMain.handle('manga:gallery', async (_, { source, id }) => {
        const src = sources.get(source);
        const g = await src.gallery(id);
        const [marked] = await mark(source, [{ id, cover: g.cover }]);
        return {
            ...g,
            source,
            id,
            login: !!src.login,
            cover: marked.cover,
            inLibrary: marked.inLibrary,
            downloading: marked.downloading,
            chapters: (g.chapters || []).map(c => ({ id: c.id, title: c.title, pages: c.pages ? images.toReaderPages(source, c.pages) : null })),
        };
    });

    ipcMain.handle('manga:chapter', async (_, { source, id, chapterId }) => {
        const src = sources.get(source);
        // Sites that give all pages with the gallery (nhentai): take them from there.
        if (!src.chapterPages) {
            const c = (await src.gallery(id)).chapters.find(x => String(x.id) === String(chapterId));
            if (!c?.pages) throw new Error('Глава не найдена на сайте');
            return images.toReaderPages(source, c.pages);
        }
        return images.toReaderPages(source, await src.chapterPages(id, chapterId));
    });

    ipcMain.handle('manga:resolveUrl', (_, { url }) => sources.matchUrl(String(url || '').trim()));
    ipcMain.handle('manga:inLibrary', async (_, { source, ids }) => {
        const lib = await libraryIndex();
        return Object.fromEntries((ids || []).map(id => [id, lib.get(sources.keyOf(source, id)) || null]));
    });

    // ─── Downloads ──────────────────────────────────────────────────────────
    ipcMain.handle('manga:download', (_, opts) => downloads.enqueue(opts));
    ipcMain.handle('manga:downloadUrl', async (_, { url, collectionId = null }) => {
        const m = sources.matchUrl(String(url || '').trim());
        if (!m) return null;
        return downloads.enqueue({ source: m.source, id: m.id, collectionId });
    });
    ipcMain.handle('manga:downloads', () => downloads.list());
    ipcMain.handle('manga:newChapters', (_, { itemId }) => downloads.newChapters(itemId));
    ipcMain.handle('manga:downloadAction', (_, { id, action }) => downloads.action(id, action));
    ipcMain.handle('manga:clearDownloads', () => downloads.clearFinished());

    // ─── In the library without downloading, subscriptions ──────────────────
    ipcMain.handle('manga:addOnline', (_, opts) => subscriptions.addOnline(opts || {}));
    // Chapters still online → the download queue (all, or `chapters`: site chapter ids).
    ipcMain.handle('manga:downloadRemote', (_, { itemId, chapters = null }) => subscriptions.downloadRemote(itemId, chapters));
    ipcMain.handle('manga:subscriptions', () => subscriptions.list());
    ipcMain.handle('manga:setSubscription', (_, { itemId, on }) => subscriptions.setOn(itemId, !!on));
    ipcMain.handle('manga:setSeen', (_, { itemId }) => subscriptions.seen(itemId));
    // One manga (itemId) → { added, queued }; all → { items, errors, checked }.
    ipcMain.handle('manga:updateSubscriptions', (_, { itemId = null } = {}) =>
        (itemId ? subscriptions.checkOne(itemId) : subscriptions.checkAll()));
    ipcMain.handle('manga:subsConfig', () => subscriptions.config());
    ipcMain.handle('manga:setSubsConfig', (_, patch) => subscriptions.setConfig(patch || {}));

    // ─── Site window ────────────────────────────────────────────────────────
    ipcMain.handle('manga:login', async (event, { source }) => {
        const src = sources.get(source);
        const url = typeof src.loginUrl === 'function' ? await src.loginUrl() : (src.loginUrl || src.home);
        let done = false;
        // AllHentai answers its sign-in link only when coming from the site itself.
        await openSiteWindow(winOf(event), url, `${src.name} — вход`, {
            referrer: `${new URL(url).origin}/`,
            // Back on the site and signed in → that's it, close the window.
            onPage: src.signedIn ? async (win) => {
                const ok = await src.signedIn(win);
                siteLog(`check ${bare(win.webContents.getURL())} → ${ok}`);
                if (ok) done = true;
                return ok;
            } : null,
        });
        const loggedIn = done || (src.checkLogin ? await src.checkLogin().catch(() => false) : null);
        siteLog(`login result ${loggedIn}`);
        return { loggedIn };
    });
    ipcMain.handle('manga:openSite', async (event, { source, url }) => {
        const src = sources.get(source);
        const target = /^https?:\/\//i.test(url || '') ? url : src.home;
        await openSiteWindow(winOf(event), target, src.name);
        return true;
    });
    ipcMain.handle('manga:clearCache', () => { images.pruneCache({ maxAgeDays: 0, maxBytes: 0 }); return true; });
}

module.exports = { register };
