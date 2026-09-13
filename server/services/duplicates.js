const { QueryTypes, Op } = require('sequelize');
const sequelize = require('../database');
const { Item } = require('../models/associations');
const Collection = require('../models/Collection');

// Exact duplicates: live items sharing the same fileHash. Returns one group per
// hash (2+ copies), each item enriched with its thumb URL and collection name so
// the finder can render cards without a second round-trip.
async function findDuplicates() {
    const dupHashes = await sequelize.query(
        `SELECT fileHash FROM Items
         WHERE deletedAt IS NULL AND fileHash IS NOT NULL AND fileHash <> ''
         GROUP BY fileHash HAVING COUNT(*) > 1`,
        { type: QueryTypes.SELECT },
    );
    if (!dupHashes.length) return { groups: [], totalGroups: 0, totalItems: 0, reclaimable: 0 };

    const hashes = dupHashes.map(r => r.fileHash);

    const items = await Item.findAll({
        where: { fileHash: { [Op.in]: hashes } },
        include: [{ model: Collection, as: 'collection', attributes: ['id', 'name'] }],
        order: [['importedAt', 'ASC']],   // oldest copy first — the natural "keep" candidate
    });

    // Group by hash, preserving the importedAt order.
    const byHash = new Map();
    for (const it of items) {
        const v = it.editedAt ? `?v=${it.editedAt}` : '';
        const row = {
            id: it.id,
            title: it.title || it.fileName,
            fileName: it.fileName,
            size: it.size,
            mimeType: it.mimeType,
            width: it.width,
            height: it.height,
            importedAt: it.importedAt,
            collectionId: it.collectionId,
            collectionName: it.collection?.name || 'Без коллекции',
            thumbPath: `library://thumb/${it.id}${v}`,
        };
        if (!byHash.has(it.fileHash)) byHash.set(it.fileHash, []);
        byHash.get(it.fileHash).push(row);
    }

    let totalItems = 0;
    let reclaimable = 0;   // bytes freed if every group is reduced to a single copy
    const groups = [];
    for (const [hash, rows] of byHash) {
        if (rows.length < 2) continue;
        totalItems += rows.length;
        // All copies are byte-identical, so any copy's size stands for the rest.
        reclaimable += (rows.length - 1) * (rows[0].size || 0);
        groups.push({ hash, items: rows });
    }

    // Biggest wins first (most copies, then largest files).
    groups.sort((a, b) =>
        b.items.length - a.items.length || (b.items[0].size || 0) - (a.items[0].size || 0));

    return { groups, totalGroups: groups.length, totalItems, reclaimable };
}

module.exports = { findDuplicates };
