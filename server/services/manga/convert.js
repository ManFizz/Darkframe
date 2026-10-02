const fs = require('fs');
const os = require('os');
const path = require('path');
const { Unzip, UnzipInflate, Zip, ZipPassThrough, strToU8 } = require('fflate');
const { Item } = require('../../models/associations');
const { withTagNames } = require('../itemTags');
const store = require('./store');

/**
 * Making manga out of things that already exist, and getting it back out:
 *   folders (one manga, chapters from subfolders, or one manga per subfolder),
 *   ZIP / CBZ archives (+ ComicInfo.xml), selected library images,
 *   export to CBZ (with ComicInfo.xml) or a plain folder, split into single images.
 */
const { isImageFile, naturalSort } = store;

function listImages(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(e => e.isFile() && isImageFile(e.name))
            .map(e => e.name).sort(naturalSort).map(n => path.join(dir, n));
    } catch { return []; }
}

function listSubdirs(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory())
            .map(e => e.name).sort(naturalSort).map(n => path.join(dir, n));
    } catch { return []; }
}

// Folder → plan(s). mode: 'auto' (images + image subfolders as chapters),
// 'each' (every subfolder with images is its own manga).
function planFolder(dir, mode = 'auto') {
    const root = listImages(dir);
    const subs = listSubdirs(dir).map(d => ({ dir: d, files: listImages(d) })).filter(s => s.files.length);
    if (mode === 'each') {
        const list = subs.map(s => ({ title: path.basename(s.dir), chapters: [{ title: '', files: s.files }] }));
        if (root.length) list.unshift({ title: path.basename(dir), chapters: [{ title: '', files: root }] });
        return list;
    }
    const chapters = [];
    if (root.length) chapters.push({ title: subs.length ? path.basename(dir) : '', files: root });
    subs.forEach(s => chapters.push({ title: path.basename(s.dir), files: s.files }));
    return chapters.length ? [{ title: path.basename(dir), chapters }] : [];
}

async function fromFolder(dir, { mode = 'auto', collectionId = null, tags = [] } = {}) {
    const plans = planFolder(dir, mode);
    if (!plans.length) throw new Error('В папке нет картинок');
    const created = [];
    for (const p of plans) created.push(await store.createManga({ ...p, collectionId, tags }));
    return created;
}

// ─── Archives ───────────────────────────────────────────────────────────────

// Streams the archive to a temp folder (no whole-archive buffers in memory).
function extractZip(file, outDir) {
    return new Promise((resolve, reject) => {
        const written = [];
        let pending = 0, ended = false, failed = false;
        const done = () => { if (ended && !pending && !failed) resolve(written); };
        const unzip = new Unzip((entry) => {
            const name = entry.name.replace(/\\/g, '/');
            if (name.endsWith('/') || name.includes('../') || name.startsWith('/')) return;
            const wanted = isImageFile(name) || /(^|\/)comicinfo\.xml$/i.test(name);
            if (!wanted || /(^|\/)__MACOSX\//.test(name)) return;
            const target = path.join(outDir, name);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            const out = fs.createWriteStream(target);
            pending++;
            out.on('error', (e) => { failed = true; reject(e); });
            out.on('finish', () => { pending--; written.push(name); done(); });
            entry.ondata = (err, chunk, final) => {
                if (err) { failed = true; reject(err); return; }
                out.write(Buffer.from(chunk));
                if (final) out.end();
            };
            entry.start();
        });
        unzip.register(UnzipInflate);
        const rs = fs.createReadStream(file);
        rs.on('data', (c) => { try { unzip.push(c); } catch (e) { failed = true; reject(e); rs.destroy(); } });
        rs.on('end', () => { try { unzip.push(new Uint8Array(0), true); } catch (e) { failed = true; reject(e); return; } ended = true; done(); });
        rs.on('error', reject);
    });
}

// The few ComicInfo.xml fields worth keeping (Komga / Kavita / ComicRack standard).
function parseComicInfo(xml) {
    const get = (tag) => {
        const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
        return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim() : '';
    };
    const list = (tag) => get(tag).split(/[,;]/).map(s => s.trim()).filter(Boolean);
    return {
        title: get('Title') || get('Series'),
        series: get('Series'),
        summary: get('Summary'),
        web: get('Web'),
        language: get('LanguageISO'),
        manga: get('Manga'),
        tags: [...list('Tags'), ...list('Genre')],
        artists: [...list('Writer'), ...list('Penciller')],
        characters: list('Characters'),
    };
}

async function fromArchive(file, { collectionId = null, tags = [] } = {}) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'darkframe-cbz-'));
    try {
        const names = await extractZip(file, tmp);
        const images = names.filter(isImageFile).sort(naturalSort);
        if (!images.length) throw new Error('В архиве нет картинок');
        // Pages grouped by their folder inside the archive → chapters.
        const byDir = new Map();
        images.forEach(n => {
            const d = path.posix.dirname(n);
            if (!byDir.has(d)) byDir.set(d, []);
            byDir.get(d).push(path.join(tmp, n));
        });
        const dirs = [...byDir.keys()].sort(naturalSort);
        const chapters = dirs.map(d => ({ title: dirs.length > 1 ? path.posix.basename(d) : '', files: byDir.get(d) }));

        const infoName = names.find(n => /(^|\/)comicinfo\.xml$/i.test(n));
        const info = infoName ? parseComicInfo(fs.readFileSync(path.join(tmp, infoName), 'utf8')) : null;
        const tagTypes = {};
        const allTags = [...tags];
        if (info) {
            info.tags.forEach(t => allTags.push(t));
            info.artists.forEach(a => { allTags.push(a); tagTypes[a.toLowerCase()] = 1; });
            info.characters.forEach(c => { allTags.push(c); tagTypes[c.toLowerCase()] = 4; });
        }
        const reading = info?.manga === 'YesAndRightToLeft' ? { direction: 'rtl' } : null;
        return await store.createManga({
            title: info?.title || path.basename(file).replace(/\.(cbz|zip)$/i, ''),
            chapters, collectionId, tags: allTags, tagTypes,
            notes: info?.summary || '', sourceUrl: info?.web || '',
            source: { kind: 'archive', file: path.basename(file), language: info?.language || null },
            reading, move: true,
        });
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

// ─── From library images ─────────────────────────────────────────────────────

function originalOf(id) {
    const dir = path.join(require('../importService').itemsPath(), id);
    try {
        const files = fs.readdirSync(dir);
        const f = files.find(x => /^original\./i.test(x));
        if (f && isImageFile(f)) return path.join(dir, f);
        return files.includes('display.jpg') ? path.join(dir, 'display.jpg') : null;
    } catch { return null; }
}

// ids in reading order. Tags: the union; rating: the highest; collection: given or the first one's.
async function fromItems(ids, { title, collectionId, trashOriginals = false } = {}) {
    const rows = await withTagNames(await Item.findAll({ where: { id: ids }, raw: true }));
    const byId = new Map(rows.map(r => [r.id, r]));
    const ordered = ids.map(id => byId.get(id)).filter(r => r && String(r.mimeType).startsWith('image/'));
    const files = ordered.map(r => originalOf(r.id)).filter(Boolean);
    if (!files.length) throw new Error('Среди выбранных нет картинок');
    const item = await store.createManga({
        title: title || ordered[0].title || 'Манга',
        chapters: [{ title: '', files }],
        collectionId: collectionId !== undefined ? collectionId : ordered[0].collectionId,
        tags: [...new Set(ordered.flatMap(r => r.tags))],
        rating: Math.max(0, ...ordered.map(r => r.rating || 0)),
        source: { kind: 'items', count: ordered.length },
    });
    if (trashOriginals) {
        await Item.update({ deletedAt: Math.floor(Date.now() / 1000) }, { where: { id: ordered.map(r => r.id) } });
    }
    return { item, used: ordered.map(r => r.id) };
}

// ─── Export ─────────────────────────────────────────────────────────────────

const xmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function comicInfoXml(id) {
    const [row] = await withTagNames(await Item.unscoped().findAll({ where: { id }, raw: true }));
    const m = store.readManifest(id);
    const lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
        `  <Title>${xmlEsc(row.title)}</Title>`,
        row.notes ? `  <Summary>${xmlEsc(row.notes)}</Summary>` : null,
        row.tags.length ? `  <Tags>${xmlEsc(row.tags.join(', '))}</Tags>` : null,
        row.sourceUrl ? `  <Web>${xmlEsc(row.sourceUrl)}</Web>` : null,
        m.source?.language ? `  <LanguageISO>${xmlEsc(m.source.language)}</LanguageISO>` : null,
        `  <PageCount>${store.pageCountOf(m)}</PageCount>`,
        m.reading?.direction === 'rtl' ? '  <Manga>YesAndRightToLeft</Manga>' : null,
        '</ComicInfo>',
    ];
    return { xml: lines.filter(Boolean).join('\n'), row, manifest: m };
}

// Entry names inside the archive / folder: chapters as folders when there are several.
function exportNames(m) {
    const many = m.chapters.length > 1;
    let n = 0;
    return m.chapters.flatMap((c, ci) => c.pages.map((p, pi) => {
        const ext = path.extname(p.file);
        const page = String(many ? pi + 1 : ++n).padStart(4, '0') + ext;
        const chDir = `${String(ci + 1).padStart(3, '0')}${c.title ? ` - ${c.title.replace(/[<>:"/\\|?*]/g, '_')}` : ''}`;
        return { file: p.file, name: many ? `${chDir}/${page}` : page };
    }));
}

async function exportCbz(id, outFile) {
    const { xml, manifest } = await comicInfoXml(id);
    const names = exportNames(manifest);
    await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(outFile);
        out.on('error', reject);
        out.on('finish', resolve);
        const zip = new Zip((err, chunk, final) => {
            if (err) { reject(err); return; }
            out.write(Buffer.from(chunk));
            if (final) out.end();
        });
        const info = new ZipPassThrough('ComicInfo.xml');
        zip.add(info);
        info.push(strToU8(xml), true);
        for (const { file, name } of names) {
            // Images are already compressed: store them as is.
            const entry = new ZipPassThrough(name);
            zip.add(entry);
            entry.push(fs.readFileSync(path.join(require('../importService').itemsPath(), id, 'pages', file)), true);
        }
        zip.end();
    });
    return { file: outFile, pages: names.length };
}

async function exportFolder(id, outDir) {
    const { manifest } = await comicInfoXml(id);
    const names = exportNames(manifest);
    for (const { file, name } of names) {
        const target = path.join(outDir, name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(require('../importService').itemsPath(), id, 'pages', file), target);
    }
    return { dir: outDir, pages: names.length };
}

// Every page as its own library image (same collection and tags as the manga).
async function splitToImages(id) {
    const [row] = await withTagNames(await Item.unscoped().findAll({ where: { id }, raw: true }));
    const { importFiles } = require('../importService');
    return importFiles({ filePaths: store.pageFiles(id), collectionId: row.collectionId, tags: row.tags, allowDuplicate: true });
}

module.exports = { planFolder, fromFolder, fromArchive, fromItems, exportCbz, exportFolder, splitToImages, parseComicInfo, extractZip };
