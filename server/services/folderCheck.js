const fs = require('fs');
const crypto = require('crypto');
const { Op, fn, col } = require('sequelize');
const { Item } = require('../models/associations');
const Collection = require('../models/Collection');

/**
 * Folders browser: which files on disk are already in the library, and which are
 * copies of each other inside the folder — by content (sha256, as the importer).
 *
 * Hashing is the slow part, so it's skipped wherever the answer is known without
 * it: a file whose size matches no library item and no other file in the folder
 * can't be a copy of anything. Hashes are cached per path + size + mtime.
 */
const hashCache = new Map();   // path → { size, mtime, hash }

function sha256(file) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        fs.createReadStream(file).on('data', c => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
    });
}

async function hashOf({ path, size, mtime }) {
    const c = hashCache.get(path);
    if (c && c.size === size && c.mtime === mtime) return c.hash;
    const hash = await sha256(path);
    hashCache.set(path, { size, mtime, hash });
    return hash;
}

let generation = 0;
const cancel = () => { generation++; };

/**
 * files: [{ path, size, mtime }] → { [path]: { inLibrary?: { id, trashed, collectionName }, copies?: [path] } }
 * Only files with something to report are in the result.
 */
async function checkFiles(files, onProgress) {
    const gen = ++generation;
    const libSizes = new Set((await Item.unscoped().findAll({
        attributes: [[fn('DISTINCT', col('size')), 'size']], raw: true,
    })).map(r => Number(r.size) || 0));
    const unknownSizes = libSizes.has(0);   // old items without a recorded size: can't pre-filter
    const perSize = new Map();
    files.forEach(f => perSize.set(f.size, (perSize.get(f.size) || 0) + 1));

    const todo = files.filter(f => f.size > 0 && (unknownSizes || libSizes.has(f.size) || perSize.get(f.size) > 1));
    const hashes = new Map();   // path → hash
    let done = 0;
    onProgress?.({ done, total: todo.length });
    for (const f of todo) {
        if (gen !== generation) return null;   // the folder changed meanwhile
        try { hashes.set(f.path, await hashOf(f)); } catch { /* unreadable — skip */ }
        done++;
        if (done % 5 === 0 || done === todo.length) onProgress?.({ done, total: todo.length });
    }

    const result = {};
    const byHash = new Map();
    for (const [p, h] of hashes) byHash.set(h, [...(byHash.get(h) || []), p]);
    for (const paths of byHash.values()) {
        if (paths.length < 2) continue;
        paths.forEach(p => { result[p] = { ...(result[p] || {}), copies: paths.filter(x => x !== p) }; });
    }

    const unique = [...byHash.keys()];
    for (let i = 0; i < unique.length; i += 900) {   // SQLite variable limit
        const rows = await Item.unscoped().findAll({
            where: { fileHash: { [Op.in]: unique.slice(i, i + 900) } },
            attributes: ['id', 'fileHash', 'deletedAt', 'collectionId'],
            include: [{ model: Collection, as: 'collection', attributes: ['name'] }],
        });
        // A live copy wins over one in the trash.
        const best = new Map();
        rows.forEach(r => { const cur = best.get(r.fileHash); if (!cur || (cur.deletedAt && !r.deletedAt)) best.set(r.fileHash, r); });
        for (const [h, r] of best) {
            const info = { id: r.id, trashed: !!r.deletedAt, collectionName: r.collection?.name || 'Без коллекции' };
            (byHash.get(h) || []).forEach(p => { result[p] = { ...(result[p] || {}), inLibrary: info }; });
        }
    }
    return result;
}

module.exports = { checkFiles, cancel, _hashCache: hashCache };
