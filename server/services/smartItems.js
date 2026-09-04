const { Op } = require('sequelize');
const Item = require('../models/Item');
const Tag = require('../models/Tag');
const ItemTag = require('../models/ItemTag');

// Items matching a saved smart-collection filter:
//   { search, tags:[{name,exclude}], ratingMin, ratingMax }
// Mirrors the client-side useLibraryFilter semantics, but runs on the server so the
// smart collection is independent of the transient navbar filter.
async function getSmartItems(filter = {}) {
    const { search = '', tags = [], ratingMin = 0, ratingMax = 10 } = filter;
    const includeNames = tags.filter(t => !t.exclude).map(t => t.name);
    const excludeNames = tags.filter(t => t.exclude).map(t => t.name);

    const where = {};
    if (search.trim()) {
        const q = `%${search.trim().toLowerCase()}%`;
        where[Op.or] = [{ title: { [Op.like]: q } }, { fileName: { [Op.like]: q } }];
    }
    where.rating = { [Op.gte]: ratingMin, [Op.lte]: ratingMax };

    // Must have ALL include tags.
    if (includeNames.length) {
        const incTags = await Tag.findAll({ where: { name: includeNames }, attributes: ['id'], raw: true });
        if (incTags.length < includeNames.length) return { collections: [], items: [] };
        const incIds = incTags.map(t => t.id);
        const rows = await ItemTag.findAll({ where: { tagId: incIds }, attributes: ['itemId', 'tagId'], raw: true });
        const byItem = new Map();
        for (const r of rows) {
            const s = byItem.get(r.itemId) || new Set();
            s.add(r.tagId); byItem.set(r.itemId, s);
        }
        const ids = [...byItem.entries()].filter(([, s]) => s.size === incIds.length).map(([id]) => id);
        if (!ids.length) return { collections: [], items: [] };
        where.id = { [Op.in]: ids };
    }

    // Must have NONE of the exclude tags.
    let excludeSet = new Set();
    if (excludeNames.length) {
        const exTags = await Tag.findAll({ where: { name: excludeNames }, attributes: ['id'], raw: true });
        const exIds = exTags.map(t => t.id);
        if (exIds.length) {
            const exRows = await ItemTag.findAll({ where: { tagId: exIds }, attributes: ['itemId'], raw: true });
            excludeSet = new Set(exRows.map(r => r.itemId));
        }
    }

    const items = await Item.findAll({
        where,
        include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
        order: [['order', 'ASC']],
    });

    const plain = items
        .filter(i => !excludeSet.has(i.id))
        .map(item => {
            const v = item.editedAt ? `?v=${item.editedAt}` : '';
            return {
                ...item.toJSON(),
                tags: item.tags.map(t => t.name),
                thumbPath: `library://thumb/${item.id}${v}`,
                originalPath: `library://item/${item.id}${v}`,
            };
        });

    return { collections: [], items: plain };
}

module.exports = { getSmartItems };
