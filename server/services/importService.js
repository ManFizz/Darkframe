const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { app } = require('electron');

const Item = require('../models/Item');
const ItemTag = require('../models/ItemTag');
const Tag = require('../models/Tag');
const Collection = require('../models/Collection');
const sequelize = require('../database');
const { SOURCE_TYPES } = require('../../src/js/Constants');
const { getActive } = require('../libraryRegistry');
const { generateImageThumb, generateVideoThumb, getVideoDuration } = require('./thumbService');
const { resolveAlias } = require('./tagAdmin');
const { beginImport } = require('./libraryEvents');

const LIBRARY_REMOTE_TYPE = SOURCE_TYPES.LIBRARY;

// The active library can change at runtime (library switcher) — always ask.
const itemsPath = () => getActive().itemsPath;

const MIME_TYPES = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png',  '.webp': 'image/webp',
    '.gif': 'image/gif',  '.jfif': 'image/jpeg',
    '.mp4': 'video/mp4',  '.webm': 'video/webm',
    '.avi': 'video/avi',  '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
};

const SUPPORTED_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif',
    '.mp4', '.webm', '.avi', '.mkv', '.mov',
    '.ts', '.m2ts', '.mts',   // stored as MP4 (repacked on import, see importFile)
]);

function getFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

async function ensureTag(name, transaction) {
    // Apply permanent rename rules (e.g. "dots" → "dot") at the single point where
    // tags are created/associated.
    const resolved = await resolveAlias(name);
    const [tag] = await Tag.findOrCreate({
        where: { name: resolved },
        defaults: {
            name: resolved,
            remoteType: LIBRARY_REMOTE_TYPE,
            type: null,
            count: null,
        },
        transaction,
    });
    return tag;
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath))
        fs.mkdirSync(dirPath, { recursive: true });
}

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

function isVideo(mimeType) {
    return mimeType.startsWith('video/');
}

// `job` — the batch this file belongs to (importFiles). Without one, a lone import
// (API / extension, link, favourite) reports itself as a one-file job, unless `quiet`
// (sources with their own progress UI, e.g. the Eagle / JSON importers).
// `origin` — 'api' for the local API / browser extension, 'app' otherwise (import
// rules can be limited to API imports).
async function importFile({ job = null, quiet = false, origin = 'app', ...args }) {
    const own = !job && !quiet ? beginImport(1) : null;
    const tracker = job || own;
    tracker?.step(path.basename(args.filePath || ''));
    let ok = false;
    let twinDir = null;
    try {
        // .ts / .m2ts: the player can't open them — the library keeps an MP4
        // (a lossless repack when the streams allow, else a re-encode).
        if (args.filePath && require('./remuxCache').needsRemux(args.filePath)) {
            twinDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'darkframe-remux-'));
            const mp4 = path.join(twinDir, `${path.basename(args.filePath, path.extname(args.filePath))}.mp4`);
            await require('./ffmpegOps').remuxToMp4(args.filePath, mp4);
            args = { ...args, filePath: mp4, originalPath: args.filePath };
        }
        const res = await importFileImpl(args);
        // A skipped duplicate points at the original (the twin is temporary).
        if (res.skipped && args.originalPath) res.filePath = args.originalPath;
        if (!res.skipped) {
            try {
                // lazy: autoRules itself uses this module's ensureTag
                res.rulesApplied = await require('./autoRules').applyOnImport(res.item.id, { origin });
            } catch (e) {
                console.warn('[autoRules] failed for', res.item.id, e.message);
            }
        }
        ok = true;
        return res;
    } finally {
        tracker?.fileDone(ok);
        own?.end();
        if (twinDir) fs.rmSync(twinDir, { recursive: true, force: true });
    }
}

async function importFileImpl({ filePath, collectionId = null, tags = [], sourceUrl = '', overrides = {}, allowDuplicate = false }) {
    const safeCollectionId =
        collectionId === 'ALL' || collectionId === 'UNCATEGORIZED' ? null : collectionId || null;

    const fileHash = await getFileHash(filePath);

    // When the user hasn't opted into duplicates, a matching hash either restores a
    // trashed copy or is reported back as a skipped duplicate. With allowDuplicate
    // we skip this check entirely and add a fresh copy (fileHash is no longer unique).
    if (!allowDuplicate) {
        const existing = await Item.unscoped().findOne({
            where: { fileHash },
            include: [{ model: Collection, as: 'collection', attributes: ['id', 'name'] }],
        });

        if (existing) {
            // A matching file already exists. If it's in the trash, don't silently
            // restore it — report it back so the UI can ask whether to pull it out.
            // Nothing is added and the trash is untouched unless the user opts in.
            return {
                skipped: true,
                reason: existing.deletedAt ? 'trashed' : 'duplicate',
                existingId: existing.id,
                existingTitle: existing.title || existing.fileName,
                collectionName: existing.collection?.name || 'Без коллекции',
                filePath,
            };
        }
    }

    const id = uuidv4();
    const itemDir = path.join(itemsPath(), id);
    ensureDir(itemDir);

    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const mimeType = getMimeType(filePath);
    const originalPath = path.join(itemDir, `original${ext}`);
    const thumbPath = path.join(itemDir, 'thumb.jpg');

    fs.copyFileSync(filePath, originalPath);
    const stat = fs.statSync(originalPath);

    let width    = overrides.width    || 0;
    let height   = overrides.height   || 0;
    let duration = overrides.duration || null;

    try {
        if (isVideo(mimeType)) {
            await generateVideoThumb(originalPath, thumbPath);
            if (!duration) duration = await getVideoDuration(originalPath);
        } else {
            const size = await generateImageThumb(originalPath, thumbPath);
            if (!width)  width  = size.width;
            if (!height) height = size.height;
        }
    } catch (e) {
        console.error(`Thumb generation failed for ${fileName}:`, e);
    }

    const item = await sequelize.transaction(async (t) => {
        const created = await Item.create({
            id,
            fileName,
            title:      overrides.title      ?? path.basename(fileName, ext),
            sourceUrl:  overrides.sourceUrl  ?? sourceUrl,
            notes:      overrides.notes      ?? '',
            rating:     overrides.rating     ?? 0,
            mimeType,
            width,
            height,
            size:       overrides.size       ?? stat.size,
            duration,
            collectionId: safeCollectionId,
            fileHash,
            importedAt: overrides.importedAt ?? Math.floor(Date.now() / 1000),
            createdAt:  Math.floor(stat.birthtimeMs / 1000),
            order:      0,
        }, { transaction: t });

        if (tags.length > 0) {
            // Sequential, not Promise.all — parallel INSERTs on the single SQLite
            // connection contend for the write lock and can throw SQLITE_BUSY.
            const tagRecords = [];
            for (const name of tags) {
                tagRecords.push(await ensureTag(name, t));
            }
            await ItemTag.bulkCreate(
                tagRecords.map(tag => ({ itemId: id, tagId: tag.id })),
                { transaction: t }
            );
        }

        return created;
    });

    return { skipped: false, item: item.toJSON() };
}

async function importFiles({ filePaths, collectionId, tags, sourceUrl, allowDuplicate = false }) {
    const results = [];
    const skipped = [];
    const errors  = [];

    // Import oldest file first so the newest ends up last. We order the batch by each
    // file's mtime and stamp importedAt in that order — newest = now, older ones a few
    // seconds earlier — so "sort by date" reflects the real file age within one import
    // (all imports still cluster at ~now, i.e. newer than everything imported before).
    const ordered = filePaths.map(fp => {
        let mtime = 0;
        try { mtime = fs.statSync(fp).mtimeMs; } catch { /* unreadable — treat as oldest */ }
        return { fp, mtime };
    });
    ordered.sort((a, b) => a.mtime - b.mtime);

    const base  = Math.floor(Date.now() / 1000);
    const count = ordered.length;
    const job   = beginImport(count);

    try {
        for (let i = 0; i < count; i++) {
            const filePath   = ordered[i].fp;
            const importedAt = base - (count - 1 - i);   // oldest gets the earliest stamp
            try {
                const result = await importFile({
                    job, filePath, collectionId, tags, sourceUrl, allowDuplicate,
                    overrides: { importedAt },
                });
                if (result.skipped) skipped.push(result);
                else                results.push(result.item);
            } catch (e) {
                console.error(`Failed to import ${filePath}:`, e);
                errors.push({ filePath, error: e.message });
            }
        }
    } finally {
        job.end();
    }

    return { results, skipped, errors };
}

async function hashExistingItems() {
    // Unscoped: trashed items need hashes too, so duplicate detection keeps working.
    const items = await Item.unscoped().findAll({ where: { fileHash: null } });
    if (!items.length) return;

    console.log(`Hashing ${items.length} existing items...`);

    for (const item of items) {
        try {
            const itemDir = path.join(itemsPath(), item.id);
            const files = fs.readdirSync(itemDir);
            const original = files.find(f => f.startsWith('original'));
            if (!original) continue;

            const hash = await getFileHash(path.join(itemDir, original));
            await item.update({ fileHash: hash });
        } catch (e) {
            console.warn(`Could not hash item ${item.id}:`, e.message);
        }
    }

    console.log('Hashing complete');
}

function collectFiles(dirPath) {
    const result  = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            result.push(...collectFiles(fullPath));
        } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (SUPPORTED_EXTENSIONS.has(ext)) result.push(fullPath);
        }
    }

    return result;
}

async function importDirectory({ dirPath, collectionId, tags = [], sourceUrl = '' }) {
    const filePaths = collectFiles(dirPath);
    if (!filePaths.length) return { results: [], skipped: [], errors: [], total: 0 };
    return importFiles({ filePaths, collectionId, tags, sourceUrl });
}

module.exports = { importFiles, importFile, itemsPath, ensureTag, hashExistingItems, importDirectory, SUPPORTED_EXTENSIONS };
