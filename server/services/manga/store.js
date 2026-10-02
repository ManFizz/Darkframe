const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../../database');
const { Item, ItemTag } = require('../../models/associations');
const Tag = require('../../models/Tag');

/**
 * Manga in the library: one Item (mimeType MANGA_MIME) whose folder holds the pages
 * instead of a single original file:
 *
 *   <item>/manga.json        manifest (chapters → pages, removed pages, source info)
 *   <item>/pages/<ch>/0001.jpg …
 *   <item>/removed/…         pages deleted by the user (restorable until purged)
 *   <item>/pthumbs/…         small page previews for the page editor (cache)
 *   <item>/thumb.jpg         cover thumbnail, like every other item
 *
 * Tags, rating, collections, trash and undo all work on the Item as usual.
 */
const MANGA_MIME = 'application/x-darkframe-manga';
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.jfif', '.bmp']);
const THUMB_W = 400;

const itemsPath = () => require('../importService').itemsPath();
const itemDir = (id) => path.join(itemsPath(), id);
const manifestFile = (id) => path.join(itemDir(id), 'manga.json');
const isImageFile = (p) => IMAGE_EXT.has(path.extname(p).toLowerCase());
const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const pad = (n) => String(n).padStart(4, '0');

function readManifest(id) {
    return JSON.parse(fs.readFileSync(manifestFile(id), 'utf8'));
}

function writeManifest(id, m) {
    const file = manifestFile(id);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(m, null, 1));
    fs.renameSync(tmp, file);
}

const isManga = (id) => fs.existsSync(manifestFile(id));
const allPages = (m) => m.chapters.flatMap(c => c.pages.map(p => ({ ...p, chapter: c.id })));
const pageCountOf = (m) => m.chapters.reduce((n, c) => n + c.pages.length, 0);
const pagePath = (id, file) => path.join(itemDir(id), 'pages', file);

// Cover thumbnail: the top of the page for very tall (webtoon) pages, else the whole page.
// Files are read into buffers first: sharp keeps a path it opened locked on Windows,
// and pages get moved / removed later.
async function makeThumb(src, dst) {
    const buf = fs.readFileSync(src);
    const meta = await sharp(buf, { animated: false }).metadata();
    const ratio = (meta.height || 1) / (meta.width || 1);
    let img = sharp(buf, { animated: false }).rotate().flatten({ background: '#ffffff' });
    if (ratio > 1.8) {
        const h = Math.round((meta.width || THUMB_W) * 1.42);
        img = img.extract({ left: 0, top: 0, width: meta.width, height: Math.min(h, meta.height) });
    }
    await img.resize(THUMB_W, THUMB_W * 2, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(dst);
    return { width: meta.width || 0, height: meta.height || 0 };
}

async function sizeOf(file) {
    try {
        const m = await sharp(fs.readFileSync(file), { animated: false }).metadata();
        return { w: m.width || 0, h: m.height || 0 };
    } catch {
        return { w: 0, h: 0 };
    }
}

/**
 * Copies (or moves) page files into a new manga item.
 * chapters: [{ title, files: [absPath] }] — files in reading order.
 * Returns the created item (plain object).
 */
async function createManga({
    title, chapters, collectionId = null, tags = [], tagTypes = {}, sourceUrl = '', notes = '',
    source = null, rating = 0, move = false, reading = null, importedAt = null, allowDuplicate = false,
}) {
    const chs = (chapters || []).map(c => ({ ...c, files: (c.files || []).filter(f => isImageFile(f) && fs.existsSync(f)) }))
        .filter(c => c.files.length);
    if (!chs.length) throw new Error('Нет картинок для манги');

    // Same pages (by content) already in the library → don't make a second copy.
    const hash = crypto.createHash('sha256');
    chs.forEach(c => c.files.forEach(f => hash.update(crypto.createHash('sha256').update(fs.readFileSync(f)).digest())));
    const fileHash = hash.digest('hex');
    if (!allowDuplicate) {
        const existing = await Item.unscoped().findOne({ where: { fileHash, mimeType: MANGA_MIME }, raw: true });
        if (existing) {
            const err = new Error(existing.deletedAt ? `Такая манга лежит в корзине: «${existing.title}»` : `Такая манга уже есть: «${existing.title}»`);
            err.code = 'DUPLICATE';
            err.existingId = existing.id;
            throw err;
        }
    }

    const id = uuidv4();
    const dir = itemDir(id);
    fs.mkdirSync(path.join(dir, 'pages'), { recursive: true });
    let total = 0;
    const manifest = { version: 1, chapters: [], removed: [], source, reading, createdAt: Math.floor(Date.now() / 1000) };
    try {
        for (let ci = 0; ci < chs.length; ci++) {
            const chId = `c${ci + 1}`;
            fs.mkdirSync(path.join(dir, 'pages', chId), { recursive: true });
            const pages = [];
            for (let pi = 0; pi < chs[ci].files.length; pi++) {
                const src = chs[ci].files[pi];
                const ext = path.extname(src).toLowerCase().replace('.jfif', '.jpg');
                const file = `${chId}/${pad(pi + 1)}${ext}`;
                const dst = pagePath(id, file);
                if (move) {
                    try { fs.renameSync(src, dst); } catch { fs.copyFileSync(src, dst); fs.rmSync(src, { force: true }); }
                } else {
                    fs.copyFileSync(src, dst);
                }
                const buf = fs.readFileSync(dst);
                total += buf.length;
                pages.push({ file, ...(await sizeOf(dst)), size: buf.length });
            }
            manifest.chapters.push({ id: chId, title: chs[ci].title || '', pages });
        }
        manifest.cover = manifest.chapters[0].pages[0].file;
        writeManifest(id, manifest);
        const dims = await makeThumb(pagePath(id, manifest.cover), path.join(dir, 'thumb.jpg'));

        const item = await sequelize.transaction(async (t) => {
            const created = await Item.create({
                id,
                fileName: `${(title || 'manga').slice(0, 200)}.manga`,
                title: title || 'Манга',
                sourceUrl,
                notes,
                rating,
                mimeType: MANGA_MIME,
                width: dims.width,
                height: dims.height,
                size: total,
                pageCount: pageCountOf(manifest),
                collectionId: collectionId || null,
                fileHash,
                importedAt: importedAt ?? Math.floor(Date.now() / 1000),
                createdAt: Math.floor(Date.now() / 1000),
                order: 0,
            }, { transaction: t });
            await attachTags(id, tags, tagTypes, t);
            return created;
        });
        return item.toJSON();
    } catch (e) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw e;
    }
}

// Tags with an optional booru-style category (1 artist, 3 parody, 4 character, 5 meta)
// for library tags that don't have one yet.
async function attachTags(id, tags, tagTypes, t) {
    const { ensureTag } = require('../importService');
    for (const name of [...new Set((tags || []).map(x => String(x).trim().toLowerCase()).filter(Boolean))]) {
        const tag = await ensureTag(name, t);
        if (tagTypes[name] != null && tag.type == null) await Tag.update({ type: tagTypes[name] }, { where: { id: tag.id }, transaction: t });
        await ItemTag.findOrCreate({ where: { itemId: id, tagId: tag.id }, transaction: t });
    }
}

// ─── Reading ─────────────────────────────────────────────────────────────────

const pageUrl = (id, file, v) => `library://page/${id}/${file.split('/').map(encodeURIComponent).join('/')}${v ? `?v=${v}` : ''}`;
const pthumbUrl = (id, file, v) => `library://pthumb/${id}/${file.split('/').map(encodeURIComponent).join('/')}${v ? `?v=${v}` : ''}`;

// What the reader / page editor needs: chapters with page URLs.
function bookOf(id) {
    const m = readManifest(id);
    const v = m.rev || 0;
    return {
        id,
        cover: m.cover,
        source: m.source || null,
        reading: m.reading || null,
        chapters: m.chapters.map(c => ({
            id: c.id,
            title: c.title,
            pages: c.pages.map(p => ({ file: p.file, w: p.w, h: p.h, url: pageUrl(id, p.file, v), thumb: pthumbUrl(id, p.file, v) })),
        })),
        removed: (m.removed || []).map(r => ({ ...r, thumb: pthumbUrl(id, `~removed/${r.stored}`, v) })),
    };
}

// Small page preview for the editor grid, cached next to the pages.
async function pageThumbFile(id, file) {
    const removed = file.startsWith('~removed/');
    const src = removed ? path.join(itemDir(id), 'removed', path.basename(file)) : resolvePage(id, file);
    if (!src || !fs.existsSync(src)) return null;
    const rel = file.replace(/[~\\/]/g, '_');
    const dst = path.join(itemDir(id), 'pthumbs', `${rel}.jpg`);
    if (fs.existsSync(dst)) return dst;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    await sharp(fs.readFileSync(src), { animated: false }).rotate().flatten({ background: '#ffffff' })
        .resize(220, 660, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toFile(dst);
    return dst;
}

// ─── Editing ─────────────────────────────────────────────────────────────────

// Bump the revision (cache-busts page / thumb URLs) and keep the Item row in step.
async function commit(id, m, { cover = false } = {}) {
    m.rev = (m.rev || 0) + 1;
    m.chapters = m.chapters.filter(c => c.pages.length || m.chapters.length === 1);
    if (!m.chapters.some(c => c.pages.some(p => p.file === m.cover))) {
        m.cover = m.chapters.find(c => c.pages.length)?.pages[0]?.file || null;
        cover = true;
    }
    writeManifest(id, m);
    const patch = { pageCount: pageCountOf(m), editedAt: Math.floor(Date.now() / 1000) };
    patch.size = allPages(m).reduce((n, p) => n + (p.size || 0), 0);
    if (cover && m.cover) {
        const dims = await makeThumb(pagePath(id, m.cover), path.join(itemDir(id), 'thumb.jpg'));
        patch.width = dims.width;
        patch.height = dims.height;
    }
    await Item.unscoped().update(patch, { where: { id } });
    require('../libraryEvents').broadcast('library:changed', { reload: true, counts: false });
    return bookOf(id);
}

// Deleted pages go to removed/ and can be restored to the same place.
async function removePages(id, files) {
    const m = readManifest(id);
    const set = new Set(files);
    m.removed = m.removed || [];
    fs.mkdirSync(path.join(itemDir(id), 'removed'), { recursive: true });
    for (const c of m.chapters) {
        const keep = [];
        c.pages.forEach((p, index) => {
            if (!set.has(p.file)) { keep.push(p); return; }
            const stored = `${Date.now().toString(36)}_${p.file.replace(/[\\/]/g, '_')}`;
            fs.renameSync(pagePath(id, p.file), path.join(itemDir(id), 'removed', stored));
            m.removed.push({ ...p, stored, chapter: c.id, index, at: Math.floor(Date.now() / 1000) });
        });
        c.pages = keep;
    }
    if (!pageCountOf(m)) throw new Error('Нельзя удалить все страницы — удалите мангу целиком');
    return commit(id, m, { cover: set.has(m.cover) });
}

async function restorePages(id, storedNames) {
    const m = readManifest(id);
    const want = new Set(storedNames);
    const back = (m.removed || []).filter(r => want.has(r.stored)).sort((a, b) => a.index - b.index);
    for (const r of back) {
        let ch = m.chapters.find(c => c.id === r.chapter);
        if (!ch) { ch = { id: r.chapter, title: '', pages: [] }; m.chapters.push(ch); }
        let file = r.file;
        if (fs.existsSync(pagePath(id, file))) file = `${r.chapter}/${r.stored}`;   // the name was reused meanwhile
        fs.mkdirSync(path.dirname(pagePath(id, file)), { recursive: true });
        fs.renameSync(path.join(itemDir(id), 'removed', r.stored), pagePath(id, file));
        const { chapter, index, stored, at, ...page } = r;
        ch.pages.splice(Math.min(index, ch.pages.length), 0, { ...page, file });
    }
    m.removed = (m.removed || []).filter(r => !want.has(r.stored));
    return commit(id, m);
}

async function purgeRemoved(id) {
    const m = readManifest(id);
    fs.rmSync(path.join(itemDir(id), 'removed'), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(path.join(itemDir(id), 'pthumbs'), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    m.removed = [];
    return commit(id, m);
}

// New page order: [{ chapter, files: [...] }] for every chapter that changed.
async function reorderPages(id, orders) {
    const m = readManifest(id);
    const byFile = new Map(allPages(m).map(p => [p.file, p]));
    for (const { chapter, files } of orders) {
        const ch = m.chapters.find(c => c.id === chapter);
        if (!ch) continue;
        const pages = files.map(f => byFile.get(f)).filter(Boolean).map(({ chapter: _c, ...p }) => p);
        // pages moved in from other chapters leave those
        const moved = new Set(files);
        m.chapters.forEach(c => { if (c !== ch) c.pages = c.pages.filter(p => !moved.has(p.file)); });
        ch.pages = pages;
    }
    return commit(id, m);
}

async function setCover(id, file) {
    const m = readManifest(id);
    if (!allPages(m).some(p => p.file === file)) throw new Error('Нет такой страницы');
    m.cover = file;
    return commit(id, m, { cover: true });
}

async function renameChapter(id, chapter, title) {
    const m = readManifest(id);
    const ch = m.chapters.find(c => c.id === chapter);
    if (ch) ch.title = String(title || '').slice(0, 300);
    return commit(id, m);
}

async function setReading(id, reading) {
    const m = readManifest(id);
    m.reading = { ...(m.reading || {}), ...reading };
    writeManifest(id, m);   // no rev bump: URLs stay valid
    return m.reading;
}

// Adds image files at the end of a chapter (or as a new chapter).
async function addPages(id, files, { chapter = null, newChapterTitle = null } = {}) {
    const m = readManifest(id);
    let ch = chapter && m.chapters.find(c => c.id === chapter);
    if (!ch) {
        const n = m.chapters.reduce((x, c) => Math.max(x, Number(c.id.slice(1)) || 0), 0) + 1;
        ch = newChapterTitle != null || !m.chapters.length ? { id: `c${n}`, title: newChapterTitle || '', pages: [] } : m.chapters[m.chapters.length - 1];
        if (!m.chapters.includes(ch)) m.chapters.push(ch);
    }
    fs.mkdirSync(path.join(itemDir(id), 'pages', ch.id), { recursive: true });
    const used = new Set(fs.readdirSync(path.join(itemDir(id), 'pages', ch.id)));
    let n = ch.pages.length;
    for (const src of files.filter(isImageFile)) {
        let name;
        do { name = `${pad(++n)}${path.extname(src).toLowerCase().replace('.jfif', '.jpg')}`; } while (used.has(name));
        used.add(name);
        const file = `${ch.id}/${name}`;
        fs.copyFileSync(src, pagePath(id, file));
        ch.pages.push({ file, ...(await sizeOf(pagePath(id, file))), size: fs.statSync(pagePath(id, file)).size });
    }
    return commit(id, m);
}

// Absolute paths of the pages in reading order (export, "split into images").
function pageFiles(id) {
    return allPages(readManifest(id)).map(p => pagePath(id, p.file));
}

// Page file (for the library://page protocol); null for anything outside pages/.
function resolvePage(id, rel) {
    const base = path.join(itemDir(id), 'pages');
    const full = path.resolve(base, rel);
    return full.startsWith(base + path.sep) && fs.existsSync(full) ? full : null;
}

function coverFile(id) {
    try {
        const m = readManifest(id);
        return m.cover ? pagePath(id, m.cover) : null;
    } catch { return null; }
}

module.exports = {
    MANGA_MIME, IMAGE_EXT, isImageFile, naturalSort,
    createManga, readManifest, isManga, bookOf, pageThumbFile,
    removePages, restorePages, purgeRemoved, reorderPages, setCover, renameChapter, setReading, addPages,
    pageFiles, resolvePage, coverFile, allPages, pageCountOf, makeThumb,
};
