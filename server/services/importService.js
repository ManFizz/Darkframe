const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

const { app } = require('electron');
const crypto = require('crypto');

const Item = require('../models/Item');
const ItemTag = require('../models/ItemTag');
const sequelize = require('../database');
const Tag = require('../models/Tag');
const { SOURCE_TYPES } = require('../../src/js/constants');
const Collection = require("../models/Collection");
const Settings = require('../../data/settings');

const LIBRARY_REMOTE_TYPE = SOURCE_TYPES.LIBRARY;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const LIBRARY_PATH = Settings.LibraryPath || path.join(app.getPath('userData'), 'library');
const ITEMS_PATH = path.join(LIBRARY_PATH, 'items');
const THUMB_SIZE = 400;

const MIME_TYPES = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png',  '.webp': 'image/webp',
    '.gif': 'image/gif',  '.jfif': 'image/jpeg',
    '.mp4': 'video/mp4',  '.webm': 'video/webm',
    '.avi': 'video/avi',
};

const SUPPORTED_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif',
    '.mp4', '.webm', '.avi',
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
    const [tag] = await Tag.findOrCreate({
        where: { name: name.toLowerCase().trim() },
        defaults: {
            name: name.toLowerCase().trim(),
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

async function generateImageThumb(srcPath, thumbPath) {
    await sharp(srcPath)
        .resize(THUMB_SIZE, THUMB_SIZE, {
            fit: 'inside',
            withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);

    const meta = await sharp(srcPath).metadata();
    return { width: meta.width || 0, height: meta.height || 0 };
}

function generateVideoThumb(srcPath, thumbPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(srcPath)
            .on('end', resolve)
            .on('error', reject)
            .screenshots({
                timestamps: ['10%'],
                filename: path.basename(thumbPath),
                folder: path.dirname(thumbPath),
                size: `${THUMB_SIZE}x?`,
            });
    });
}

function getVideoDuration(filePath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return resolve(null);
            resolve(metadata?.format?.duration || null);
        });
    });
}

async function importFile({ filePath, collectionId = null, tags = [], sourceUrl = '', overrides = {} }) {
    const safeCollectionId =
        collectionId === 'ALL' || collectionId === 'UNCATEGORIZED' ? null : collectionId || null;

    const fileHash = await getFileHash(filePath);

    const existing = await Item.findOne({
        where: { fileHash },
        include: [{ model: Collection, as: 'collection', attributes: ['id', 'name'] }],
    });

    if (existing) {
        return {
            skipped: true,
            reason: 'duplicate',
            existingId: existing.id,
            existingTitle: existing.title || existing.fileName,
            collectionName: existing.collection?.name || 'Без коллекции',
            filePath,
        };
    }

    const id = uuidv4();
    const itemDir = path.join(ITEMS_PATH, id);
    ensureDir(itemDir);

    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const mimeType = getMimeType(filePath);
    const originalPath = path.join(itemDir, `original${ext}`);
    const thumbPath = path.join(itemDir, 'thumb.jpg');

    fs.copyFileSync(filePath, originalPath);
    const stat = fs.statSync(originalPath);

    let width = overrides.width || 0;
    let height = overrides.height || 0;
    let duration = overrides.duration || null;

    try {
        if (isVideo(mimeType)) {
            await generateVideoThumb(originalPath, thumbPath);
            if (!duration) duration = await getVideoDuration(originalPath);
        } else {
            const size = await generateImageThumb(originalPath, thumbPath);
            if (!width) width = size.width;
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
            const tagRecords = await Promise.all(
                tags.map(name => ensureTag(name, t))
            );
            await ItemTag.bulkCreate(
                tagRecords.map(tag => ({ itemId: id, tagId: tag.id })),
                { transaction: t }
            );
        }

        return created;
    });

    return { skipped: false, item: item.toJSON() };
}

async function importFiles({ filePaths, collectionId, tags, sourceUrl }) {
    const results = [];
    const skipped = [];
    const errors = [];

    for (const filePath of filePaths) {
        try {
            const result = await importFile({ filePath, collectionId, tags, sourceUrl });

            if (result.skipped) {
                skipped.push(result);
            } else {
                results.push(result.item);
            }
        } catch (e) {
            console.error(`Failed to import ${filePath}:`, e);
            errors.push({ filePath, error: e.message });
        }
    }

    return { results, skipped, errors };
}

async function hashExistingItems() {
    const items = await Item.findAll({ where: { fileHash: null } });
    if (!items.length) return;

    console.log(`Hashing ${items.length} existing items...`);

    for (const item of items) {
        try {
            const itemDir = path.join(ITEMS_PATH, item.id);
            const files = fs.readdirSync(itemDir);
            const original = files.find(f => f.startsWith('original'));
            if (!original) continue;

            const filePath = path.join(itemDir, original);
            const hash = await getFileHash(filePath);
            await item.update({ fileHash: hash });
        } catch (e) {
            console.warn(`Could not hash item ${item.id}:`, e.message);
        }
    }

    console.log('Hashing complete');
}

function collectFiles(dirPath) {
    const result = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            result.push(...collectFiles(fullPath)); // рекурсия
        } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (SUPPORTED_EXTENSIONS.has(ext)) {
                result.push(fullPath);
            }
        }
    }

    return result;
}

async function importDirectory({ dirPath, collectionId, tags = [], sourceUrl = '' }) {
    const filePaths = collectFiles(dirPath);

    if (!filePaths.length) {
        return { results: [], skipped: [], errors: [], total: 0 };
    }

    return importFiles({ filePaths, collectionId, tags, sourceUrl });
}

module.exports = { importFiles, importFile, LIBRARY_PATH, ITEMS_PATH, ensureTag, hashExistingItems, importDirectory };