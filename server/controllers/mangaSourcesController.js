const { ipcMain, BrowserWindow } = require('electron');
const { Op } = require('sequelize');
const sources = require('../services/manga/sources');
const images = require('../services/manga/images');
const downloads = require('../services/manga/downloads');
const http = require('../services/manga/http');
const { MANGA_MIME } = require('../services/manga/store');
const { Item } = require('../models/associations');
const MangaDownload = require('../models/MangaDownload');

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
// A site page in the manga session: sign-in (AllHentai), a Cloudflare check.
// Resolves when the window is closed.
function openSiteWindow(parent, url, title, referrer = null) {
    const load = (w) => w.loadURL(url, referrer ? { httpReferrer: referrer } : undefined).catch(() => {});
    if (siteWin && !siteWin.isDestroyed()) {
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
    win.webContents.setUserAgent(http.UA());
    // Pop-ups (OAuth etc.) open in the same window instead of new ones.
    win.webContents.setWindowOpenHandler(({ url: u }) => {
        if (/^https?:\/\//i.test(u)) win.loadURL(u).catch(() => {});
        return { action: 'deny' };
    });
    win.closedPromise = new Promise(resolve => win.on('closed', () => { siteWin = null; resolve(true); }));
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

    ipcMain.handle('manga:search', async (_, { source, query = '', page = 1, sort = null, next = null }) => {
        const src = sources.get(source);
        // A pasted gallery link goes straight to the card.
        const link = sources.matchUrl(query.trim());
        if (link && /^https?:\/\//i.test(query.trim())) return { open: link, items: [], hasMore: false };
        const res = await src.search({ query, page, sort: sort || src.sorts?.[0]?.id, next });
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
        if (!src.chapterPages) throw new Error('У источника нет глав');
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

    // ─── Site window ────────────────────────────────────────────────────────
    ipcMain.handle('manga:login', async (event, { source }) => {
        const src = sources.get(source);
        const url = typeof src.loginUrl === 'function' ? await src.loginUrl() : (src.loginUrl || src.home);
        // AllHentai answers its sign-in link only when coming from the site itself.
        await openSiteWindow(winOf(event), url, `${src.name} — вход`, `${new URL(url).origin}/`);
        return true;
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
