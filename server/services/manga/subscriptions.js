const { Item } = require('../../models/associations');
const store = require('./store');
const sources = require('./sources');

/**
 * Subscriptions to library manga from sites with chapters: every few hours (and
 * on the "check for updates" button) the site is asked for chapters the manga
 * doesn't have; they're added at once as online chapters (readable now,
 * downloadable later) or, if so set, downloaded. Tiles show "+N" until the
 * manga is opened.
 *
 * The subscription lives in the manga's manifest: { on, checkedAt, unseen, error }.
 * Settings (data/settings): mangaSubsHours (0 — no schedule), mangaSubsAutoDownload.
 */
const TICK = 10 * 60 * 1000;
const PAUSE = 1500;   // between galleries: be gentle with the sites

const now = () => Math.floor(Date.now() / 1000);
const settings = () => require('../../../data/settings');
let state = null;      // itemId → { unseen, remote } for library tiles
let running = null;    // { done, total } while a check runs
let timer = null;
let lastRun = 0;       // s

function chaptered(site) {
    try { return !!sources.get(site).chapterPages && site !== 'ehentai'; } catch { return false; }
}

// Manga items with their manifest (skips broken ones).
async function mangaItems() {
    const rows = await Item.findAll({ where: { mimeType: store.MANGA_MIME }, attributes: ['id', 'title', 'collectionId', 'editedAt', 'thumbAt'], raw: true });
    const out = [];
    for (const r of rows) {
        try { out.push({ ...r, m: store.readManifest(r.id) }); } catch { /* no manifest */ }
    }
    return out;
}

async function rebuild() {
    const next = new Map();
    for (const { id, m } of await mangaItems()) {
        const remote = m.chapters.filter(c => c.remote).length;
        const unseen = m.subscription?.on ? m.subscription.unseen || 0 : 0;
        if (remote || unseen) next.set(id, { unseen, remote });
    }
    state = next;
    return state;
}

function touch(id) {
    if (!state) return;
    try {
        const m = store.readManifest(id);
        const remote = m.chapters.filter(c => c.remote).length;
        const unseen = m.subscription?.on ? m.subscription.unseen || 0 : 0;
        if (remote || unseen) state.set(id, { unseen, remote });
        else state.delete(id);
    } catch { state.delete(id); }
}

// Library rows → + mangaNew / mangaRemote for manga tiles.
async function attach(items) {
    if (!state) await rebuild();
    if (!state.size) return items;
    return items.map(it => {
        const s = it.pageCount != null && state.get(it.id);
        return s ? { ...it, mangaNew: s.unseen, mangaRemote: s.remote } : it;
    });
}

async function list() {
    const out = [];
    const { itemUrls } = require('../itemUrls');
    for (const { id, title, editedAt, thumbAt, m } of await mangaItems()) {
        if (!m.subscription?.on) continue;
        out.push({
            id, title, thumbPath: itemUrls({ id, editedAt, thumbAt }).thumbPath, site: m.source?.site || null, galleryId: m.source?.id || null,
            chapters: m.chapters.length, remote: m.chapters.filter(c => c.remote).length,
            ...m.subscription,
        });
    }
    return out.sort((a, b) => (b.unseen || 0) - (a.unseen || 0) || a.title.localeCompare(b.title, 'ru'));
}

function broadcast(channel, payload) {
    try { require('../libraryEvents').broadcast(channel, payload); } catch { /* tests */ }
}

async function setOn(id, on) {
    const m = store.readManifest(id);
    if (on) {
        if (m.source?.kind !== 'online' || !chaptered(m.source.site)) throw new Error('Подписка — только для манги с сайтов с главами (AllHentai, Hentai2Read, MangaDex)');
        store.setSubscription(id, { on: true, unseen: m.subscription?.unseen || 0 });
    } else {
        store.setSubscription(id, null);
    }
    touch(id);
    broadcast('library:changed', { reload: true, counts: false });
    return store.bookOf(id).subscription;
}

function seen(id) {
    let m;
    try { m = store.readManifest(id); } catch { return null; }
    if (!m.subscription?.unseen) return m.subscription || null;
    const sub = store.setSubscription(id, { unseen: 0 });
    touch(id);
    broadcast('library:changed', { reload: true, counts: false });
    return sub;
}

/**
 * One manga: new chapters on the site → online chapters (or the download queue).
 * → { added: [{ id, title }], queued }
 */
async function checkOne(id, { download = settings().mangaSubsAutoDownload } = {}) {
    const downloads = require('./downloads');
    try {
        const r = await downloads.newChapters(id);
        const added = await store.addRemoteChapters(id, r.chapters);
        const m = store.readManifest(id);
        const sub = m.subscription ? store.setSubscription(id, {
            checkedAt: now(), error: null, unseen: (m.subscription.unseen || 0) + added.length,
        }) : null;
        let queued = false;
        if (download && added.length) {
            await downloads.enqueue({ source: r.source, id: r.id, chapters: added.map(c => c.src), appendTo: id });
            queued = true;
        }
        touch(id);
        return { added: added.map(c => ({ id: c.src, title: c.title })), queued, subscription: sub };
    } catch (e) {
        try { if (store.readManifest(id).subscription) store.setSubscription(id, { checkedAt: now(), error: e.message || String(e) }); } catch { /* gone */ }
        throw e;
    }
}

/**
 * All subscriptions (or `ids`). Progress goes out as manga:subs { running, done, total },
 * the result as manga:updates { items: [{ id, title, added }], errors }.
 */
async function checkAll({ ids = null, reason = 'manual' } = {}) {
    if (running) return { busy: true, ...running };
    const subs = (await list()).filter(s => !ids || ids.includes(s.id));
    running = { done: 0, total: subs.length };
    lastRun = now();
    broadcast('manga:subs', { running: true, ...running });
    const items = [], errors = [];
    try {
        for (const s of subs) {
            try {
                const r = await checkOne(s.id);
                if (r.added.length) items.push({ id: s.id, title: s.title, added: r.added.length, queued: r.queued });
            } catch (e) {
                errors.push({ id: s.id, title: s.title, error: e.message || String(e) });
            }
            running.done++;
            broadcast('manga:subs', { running: true, ...running });
            if (running.done < subs.length) await new Promise(r => setTimeout(r, PAUSE));
        }
    } finally {
        running = null;
        broadcast('manga:subs', { running: false });
    }
    if (items.length) broadcast('library:changed', { reload: true, counts: false });
    const res = { items, errors, checked: subs.length, reason };
    broadcast('manga:updates', res);
    try { require('../tray').mangaUpdates(items); } catch { /* no tray (tests) */ }
    return res;
}

const config = () => ({
    hours: Number(settings().mangaSubsHours ?? 6) || 0,
    autoDownload: !!settings().mangaSubsAutoDownload,
    lastRun,
    running: running ? { ...running } : null,
});

function setConfig({ hours, autoDownload } = {}) {
    const { setSetting } = require('../../controllers/settingsController');
    if (hours !== undefined) setSetting('mangaSubsHours', Math.max(0, Number(hours) || 0));
    if (autoDownload !== undefined) setSetting('mangaSubsAutoDownload', !!autoDownload);
    return config();
}

async function tick() {
    const { hours } = config();
    if (!hours || running) return;
    if (now() - lastRun < hours * 3600) return;
    if (!(await list()).length) return;
    await checkAll({ reason: 'schedule' }).catch(e => console.warn('[manga] subscriptions:', e.message));
}

// The last check is the oldest checkedAt of the subscriptions: after a restart the
// schedule continues instead of starting over.
async function start() {
    const subs = await list();
    const times = subs.map(s => s.checkedAt || 0);
    lastRun = times.length ? Math.min(...times) : 0;
    await rebuild();
    clearInterval(timer);
    timer = setInterval(() => tick(), TICK);
    setTimeout(() => tick(), 90 * 1000);
}

/**
 * A gallery → the library without downloading (chapters read from the site);
 * sites with chapters get a subscription at once.
 * → { item, subscribed } | { item: null, existingId, duplicate }
 */
async function addOnline({ source, id, collectionId = null, subscribe = true }) {
    const images = require('./images');
    const src = sources.get(source);
    const g = await src.gallery(id);
    if (!g.chapters?.length) throw new Error('На сайте нет глав для чтения');
    const cover = g.cover ? await images.fetchImage(source, g.cover).catch(() => null) : null;
    const tagTypes = {};
    const tags = (g.tags || []).map(t => {
        const name = String(t.name).toLowerCase();
        if (src.tagTypes?.[t.type]) tagTypes[name] = src.tagTypes[t.type];
        return name;
    });
    const sub = subscribe && chaptered(source) ? { on: true, unseen: 0, checkedAt: now() } : null;
    let item;
    try {
        item = await store.createOnlineManga({
            title: g.title,
            chapters: g.chapters.map(c => ({ sourceId: c.id, title: g.chapters.length > 1 ? c.title : '' })),
            coverFile: cover, collectionId, tags, tagTypes, sourceUrl: g.url, notes: g.description || '',
            source: { kind: 'online', site: source, id: String(id), language: g.language || null, altTitle: g.altTitle || '' },
            reading: g.reading || null,
            subscription: sub,
        });
    } catch (e) {
        if (e.code === 'DUPLICATE') return { item: null, existingId: e.existingId, duplicate: e.message };
        throw e;
    }
    touch(item.id);
    broadcast('library:changed', { added: 1, addedTo: [collectionId || null], counts: true });
    return { item, subscribed: !!sub };
}

// Chapters still online → the download queue (all, or `chapters`: site chapter ids).
async function downloadRemote(itemId, chapters = null) {
    const s = store.bookOf(itemId).source;
    if (s?.kind !== 'online') throw new Error('Эта манга не с сайта');
    const want = store.remoteChapters(itemId).map(c => c.src).filter(x => !chapters || chapters.includes(x));
    if (!want.length) return null;
    return require('./downloads').enqueue({ source: s.site, id: s.id, chapters: want, appendTo: itemId });
}

module.exports = { addOnline, downloadRemote, attach, list, setOn, seen, checkOne, checkAll, config, setConfig, start, touch, rebuild, chaptered };
