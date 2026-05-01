const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { app } = require('electron');

const Item = require('../models/Item');
const ItemTag = require('../models/ItemTag');
const sequelize = require('../database');
const Tag = require('../models/Tag');
const { SOURCE_TYPES } = require('../../src/js/constants');

const LIBRARY_REMOTE_TYPE = SOURCE_TYPES.LIBRARY;

ffmpeg.setFfmpegPath(ffmpegPath);

const LIBRARY_PATH = path.join(app.getPath('userData'), 'library');
const ITEMS_PATH = path.join(LIBRARY_PATH, 'items');
const THUMB_SIZE = 400;

const MIME_TYPES = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png',  '.webp': 'image/webp',
    '.gif': 'image/gif',  '.jfif': 'image/jpeg',
    '.mp4': 'video/mp4',  '.webm': 'video/webm',
    '.avi': 'video/avi',
};

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

async function importFile({ filePath, collectionId = null, tags = [], sourceUrl = '' }) {
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

    let width = 0, height = 0, duration = null;

    try {
        if (isVideo(mimeType)) {
            await generateVideoThumb(originalPath, thumbPath);
            duration = await getVideoDuration(originalPath);
        } else {
            const size = await generateImageThumb(originalPath, thumbPath);
            width = size.width;
            height = size.height;
        }
    } catch (e) {
        console.error(`Thumb generation failed for ${fileName}:`, e);
    }

    const item = await sequelize.transaction(async (t) => {
        const created = await Item.create({
            id,
            fileName,
            title: path.basename(fileName, ext),
            sourceUrl,
            mimeType,
            width,
            height,
            size: stat.size,
            duration,
            collectionId: collectionId || null,
            createdAt: Math.floor(stat.birthtimeMs / 1000),
        }, { transaction: t });

        if (tags.length > 0) {
            const tagRecords = await Promise.all(
                tags.map(name => ensureTag(name, t))
            );
            await ItemTag.bulkCreate(
                tagRecords.map(tag => ({ itemId: created.id, tagId: tag.id })),
                { transaction: t }
            );
        }

        return created;
    });

    return {
        ...item.toJSON(),
        tags,
        thumbPath: thumbPath,
        originalPath: originalPath,
    };
}

async function importFiles({ filePaths, collectionId, tags, sourceUrl }) {
    const results = [];
    const errors = [];

    for (const filePath of filePaths) {
        try {
            const item = await importFile({ filePath, collectionId, tags, sourceUrl });
            results.push(item);
        } catch (e) {
            console.error(`Failed to import ${filePath}:`, e);
            errors.push({ filePath, error: e.message });
        }
    }

    return { results, errors };
}

module.exports = { importFiles, importFile, LIBRARY_PATH, ITEMS_PATH, ensureTag };