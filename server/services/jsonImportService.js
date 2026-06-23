// server/services/jsonImportService.js
//
// Flexible JSON import — designed to be produced by browser extensions later.
//
// Accepted top-level shapes:
//   [ item, item, ... ]
//   { "collection": "Default/Name", "items": [ item, ... ] }
//
// Each item (all fields optional except a media source):
//   Media source (one of):
//     "url" | "src"        — remote media, downloaded
//     "filePath" | "path"  — local file, imported in place
//     "base64" (+ "mimeType") — inline bytes
//   Metadata:
//     "title" | "name"
//     "tags"               — array of strings OR comma-separated string
//     "source" | "sourceUrl"
//     "notes" | "description"
//     "collection" | "collectionName" — name or "Parent/Child" path; created if missing
//     "rating", "width", "height", "duration", "size", "importedAt"
//
// Collections are resolved by name (creating any missing levels). The per-item
// collection wins over the top-level default, which wins over the collectionId
// passed from the UI (the currently selected collection).

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const axios = require('axios');
const { importFile } = require('./importService');
const Collection = require('../models/Collection');

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';

const CONTENT_TYPE_EXT = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'image/gif': '.gif',  'video/mp4': '.mp4', 'video/webm': '.webm',
};

// ─── parsing helpers ───────────────────────────────────────────────────────────

function parseFile(jsonPath) {
    const content = fs.readFileSync(jsonPath, 'utf-8').replace(/^﻿/, '');
    const data = JSON.parse(content);
    if (Array.isArray(data)) return { items: data, defaultCollection: null };
    return {
        items: Array.isArray(data.items) ? data.items : [],
        defaultCollection: data.collection || data.collectionName || null,
    };
}

function normalizeTags(tags) {
    if (!tags) return [];
    const arr = Array.isArray(tags) ? tags : String(tags).split(',');
    return [...new Set(arr.map(t => String(t).trim().toLowerCase()).filter(Boolean))];
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}

function toUnixSeconds(v) {
    if (v == null || v === '') return undefined;
    if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
    const t = Date.parse(v);
    return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

function randomTmp(ext) {
    return path.join(os.tmpdir(), `df-json-${Date.now()}-${Math.random().toString(36).slice(2)}${ext || '.bin'}`);
}

async function downloadToTemp(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': USER_AGENT },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });
    let ext = path.extname(new URL(url).pathname).split('?')[0].toLowerCase();
    if (!ext) ext = CONTENT_TYPE_EXT[(res.headers['content-type'] || '').split(';')[0]] || '.bin';
    const tmp = randomTmp(ext);
    fs.writeFileSync(tmp, Buffer.from(res.data));
    return tmp;
}

function writeBase64Temp(base64, mimeType) {
    const ext = CONTENT_TYPE_EXT[mimeType] ||
        '.' + ((mimeType && mimeType.split('/')[1]) || 'bin').replace('jpeg', 'jpg');
    const tmp = randomTmp(ext);
    fs.writeFileSync(tmp, Buffer.from(base64, 'base64'));
    return tmp;
}

// ─── collection resolver (find-or-create by name / path, cached per run) ────────

function makeCollectionResolver() {
    const cache = new Map(); // `${parentId||'root'}::${nameLower}` -> id

    async function ensureLevel(name, parentId) {
        const key = `${parentId || 'root'}::${name.toLowerCase()}`;
        if (cache.has(key)) return cache.get(key);

        let col = await Collection.findOne({ where: { name, parentId: parentId || null } });
        if (!col) {
            const maxOrder = (await Collection.max('order', { where: { parentId: parentId || null } })) || 0;
            col = await Collection.create({ name, parentId: parentId || null, order: maxOrder + 1 });
        }
        cache.set(key, col.id);
        return col.id;
    }

    return async function resolve(nameOrPath) {
        if (!nameOrPath) return undefined;
        const parts = String(nameOrPath).split('/').map(s => s.trim()).filter(Boolean);
        if (!parts.length) return undefined;

        let parentId = null;
        for (const part of parts) parentId = await ensureLevel(part, parentId);
        return parentId;
    };
}

// ─── main ───────────────────────────────────────────────────────────────────────

async function importFromJson({ jsonPath, collectionId = null, webContents }) {
    const { items, defaultCollection } = parseFile(jsonPath);
    const resolveCollection = makeCollectionResolver();

    const total = items.length;
    const results = [];
    const skipped = [];
    const errors  = [];

    for (let i = 0; i < items.length; i++) {
        const it = items[i] || {};
        const title = it.title || it.name || '';

        webContents?.send('library:importProgress', {
            current: i + 1, total, title, label: 'Импорт из JSON',
        });

        // Resolve target collection: item name → file default → UI collectionId
        let targetCollectionId = collectionId;
        const colName = it.collection ?? it.collectionName ?? defaultCollection;
        if (colName) {
            try { targetCollectionId = await resolveCollection(colName); }
            catch (e) { console.warn('[jsonImport] collection resolve failed:', e.message); }
        }

        let tmp = null;
        try {
            let filePath;
            if (it.filePath || it.path) {
                filePath = it.filePath || it.path;
                if (!fs.existsSync(filePath)) throw new Error('Файл не найден: ' + filePath);
            } else if (it.url || it.src) {
                tmp = filePath = await downloadToTemp(it.url || it.src);
            } else if (it.base64) {
                tmp = filePath = writeBase64Temp(it.base64, it.mimeType);
            } else {
                throw new Error('Нет источника медиа (url/filePath/base64)');
            }

            const sourceUrl = it.source || it.sourceUrl || '';

            const result = await importFile({
                filePath,
                collectionId: targetCollectionId ?? null,
                tags: normalizeTags(it.tags),
                sourceUrl,
                overrides: {
                    title:      title || undefined,
                    sourceUrl:  sourceUrl || undefined,
                    notes:      it.notes ?? it.description ?? '',
                    rating:     num(it.rating),
                    width:      num(it.width),
                    height:     num(it.height),
                    duration:   num(it.duration),
                    size:       num(it.size),
                    importedAt: toUnixSeconds(it.importedAt),
                },
            });

            result.skipped ? skipped.push(result) : results.push(result);
        } catch (e) {
            errors.push({ title: title || it.url || it.filePath || '', error: e.message });
        } finally {
            if (tmp && fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
        }
    }

    webContents?.send('library:importProgress', { current: total, total, done: true, label: 'Импорт из JSON' });

    return { results, skipped, errors, total };
}

module.exports = { importFromJson, parseFile };
