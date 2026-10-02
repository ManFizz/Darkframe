const MangaDownload = require('../../models/MangaDownload');
const sources = require('./sources');
const images = require('./images');
const store = require('./store');

/**
 * Download queue: online manga → library. Jobs live in the DB (unfinished ones
 * continue after a restart); one gallery at a time, a few pages in parallel, each
 * page retried. Pages go through the same disk cache as online reading.
 */
const CONCURRENCY = 3;
const RETRIES = 3;
let running = null;        // id of the job being worked on
let stopRequested = null;  // id to pause / cancel at the next page
let broadcastTimer = null;

const now = () => Math.floor(Date.now() / 1000);
const parse = (s) => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };

function broadcast() {
    if (broadcastTimer) return;
    broadcastTimer = setTimeout(async () => {
        broadcastTimer = null;
        try { require('../libraryEvents').broadcast('manga:downloads', await list()); } catch { /* tests */ }
    }, 250);
}

async function list() {
    const rows = await MangaDownload.findAll({ order: [['id', 'DESC']], limit: 200, raw: true });
    return rows.map(r => ({ ...r, options: parse(r.options) }));
}

/**
 * Queue a gallery. options: { collectionId, chapters: [chapterId] | null (all), tags: [] }
 * An already queued / running job of the same gallery is returned instead of a new one.
 */
async function enqueue({ source, id, collectionId = null, chapters = null, title = null, cover = null, appendTo = null }) {
    sources.get(source);
    const same = await MangaDownload.findOne({ where: { source, galleryId: String(id), status: ['queued', 'running', 'paused'] } });
    if (same) return same.toJSON();
    const row = await MangaDownload.create({
        source, galleryId: String(id), url: sources.get(source).urlOf(id), title, cover,
        status: 'queued', collectionId, options: JSON.stringify({ chapters, appendTo }), createdAt: now(), updatedAt: now(),
    });
    broadcast();
    kick();
    return row.toJSON();
}

async function update(id, patch) {
    await MangaDownload.update({ ...patch, updatedAt: now() }, { where: { id } });
    broadcast();
}

// Fetch with retries; resolves to the cached file.
async function fetchPage(source, page) {
    let last;
    for (let i = 0; i < RETRIES; i++) {
        try { return await images.fetchImage(source, page.url, { resolve: !!page.resolve }); }
        catch (e) { last = e; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
    }
    throw last;
}

async function work(job) {
    running = job.id;
    stopRequested = null;
    const src = sources.get(job.source);
    await update(job.id, { status: 'running', error: null });
    try {
        const g = await src.gallery(job.galleryId);
        const { chapters: wanted, appendTo } = parse(job.options);
        // New chapters for a manga already in the library: only the ones it lacks.
        const have = appendTo ? new Set(store.bookOf(appendTo).chapters.map(c => c.src).filter(Boolean)) : null;
        const chapters = g.chapters.filter(c => (!wanted?.length || wanted.includes(c.id)) && !have?.has(String(c.id)));
        if (appendTo && !chapters.length) {
            await update(job.id, { status: 'done', itemId: appendTo, error: 'Новых глав нет' });
            return;
        }
        if (!job.title || !job.cover) await update(job.id, { title: g.title, cover: g.cover });

        // Page lists first (online sources may need a request per chapter).
        const plan = [];
        for (const c of chapters) {
            const pages = c.pages || await src.chapterPages(job.galleryId, c.id);
            plan.push({ title: chapters.length > 1 || appendTo ? c.title : '', sourceId: c.id, pages });
        }
        const total = plan.reduce((n, c) => n + c.pages.length, 0);
        if (!total) throw new Error('Нечего скачивать: в галерее нет страниц');
        await update(job.id, { total });

        let done = 0;
        const files = plan.map(c => new Array(c.pages.length));
        const queue = plan.flatMap((c, ci) => c.pages.map((p, pi) => ({ p, ci, pi })));
        let failed = null;
        const worker = async () => {
            while (queue.length && !failed) {
                if (stopRequested === job.id) return;
                const { p, ci, pi } = queue.shift();
                try {
                    files[ci][pi] = await fetchPage(job.source, p);
                    done++;
                    if (done % 2 === 0 || done === total) await update(job.id, { done });
                } catch (e) {
                    failed = e;
                }
            }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        if (stopRequested === job.id) return;   // paused / canceled: the status is already set
        if (failed) throw failed;

        if (appendTo) {
            for (let ci = 0; ci < plan.length; ci++) {
                await store.addPages(appendTo, files[ci], { newChapterTitle: plan[ci].title || `Глава ${ci + 1}`, sourceId: plan[ci].sourceId });
            }
            await update(job.id, { status: 'done', done: total, itemId: appendTo });
            return;
        }

        const tagTypes = {};
        const tags = (g.tags || []).map(t => {
            const name = String(t.name).toLowerCase();
            const type = src.tagTypes?.[t.type];
            if (type) tagTypes[name] = type;
            return name;
        });
        let item;
        try {
            item = await store.createManga({
                title: g.title,
                chapters: plan.map((c, ci) => ({ title: c.title, sourceId: c.sourceId, files: files[ci] })),
                collectionId: job.collectionId,
                tags,
                tagTypes,
                sourceUrl: g.url,
                notes: g.description || '',
                source: { kind: 'online', site: job.source, id: job.galleryId, language: g.language || null, altTitle: g.altTitle || '' },
                reading: g.reading || null,
            });
        } catch (e) {
            if (e.code !== 'DUPLICATE') throw e;
            await update(job.id, { status: 'done', done: total, itemId: e.existingId, error: 'Уже была в библиотеке' });
            return;
        }
        await update(job.id, { status: 'done', done: total, itemId: item.id });
    } catch (e) {
        await update(job.id, { status: 'error', error: e.message || String(e) });
    } finally {
        running = null;
        stopRequested = null;
    }
}

let kicking = false;
async function kick() {
    if (running || kicking) return;
    kicking = true;
    try {
        const next = await MangaDownload.findOne({ where: { status: 'queued' }, order: [['id', 'ASC']], raw: true });
        if (next) work(next).then(() => setImmediate(kick));
    } finally {
        kicking = false;
    }
}

async function action(id, act) {
    const row = await MangaDownload.findByPk(id);
    if (!row) return list();
    if (act === 'pause' && ['queued', 'running'].includes(row.status)) {
        if (running === id) stopRequested = id;
        await update(id, { status: 'paused' });
    } else if ((act === 'resume' || act === 'retry') && ['paused', 'error', 'canceled'].includes(row.status)) {
        await update(id, { status: 'queued', error: null });
        kick();
    } else if (act === 'cancel') {
        if (running === id) stopRequested = id;
        await update(id, { status: 'canceled' });
    } else if (act === 'remove' && running !== id) {
        await row.destroy();
        broadcast();
    }
    return list();
}

async function clearFinished() {
    await MangaDownload.destroy({ where: { status: ['done', 'canceled'] } });
    broadcast();
    return list();
}

// After a restart: what was running goes back to the queue.
async function start() {
    await MangaDownload.update({ status: 'queued' }, { where: { status: 'running' } });
    kick();
}

/**
 * Chapters on the site that a downloaded manga doesn't have yet.
 * → { source, id, chapters: [{ id, title }], known }
 */
async function newChapters(itemId) {
    const book = store.bookOf(itemId);
    const s = book.source;
    if (s?.kind !== 'online' || !s.site || !s.id) throw new Error('Эта манга скачана не с сайта');
    const g = await sources.get(s.site).gallery(s.id);
    // One-gallery-one-chapter sites (nhentai, e-hentai) never get new chapters.
    if (g.chapters.length === 1 && g.chapters[0].id === 'all') return { source: s.site, id: s.id, chapters: [], known: book.chapters.length };
    const have = new Set(book.chapters.map(c => c.src).filter(Boolean));
    // Older downloads without chapter ids: compare by title.
    const titles = new Set(book.chapters.map(c => c.title).filter(Boolean));
    const fresh = g.chapters.filter(c => !have.has(String(c.id)) && !(have.size === 0 && titles.has(c.title)));
    return { source: s.site, id: s.id, chapters: fresh.map(c => ({ id: c.id, title: c.title })), known: book.chapters.length };
}

module.exports = { enqueue, list, action, clearFinished, start, kick, newChapters };
