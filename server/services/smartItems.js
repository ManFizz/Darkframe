const { Op } = require('sequelize');
const Item = require('../models/Item');
const Tag = require('../models/Tag');
const ItemTag = require('../models/ItemTag');
const { itemUrls } = require('./itemUrls');
const { normalizeFilter, matchItem } = require('../../src/js/shared/filterPredicate');

// Items matching a saved smart-collection filter (see shared/filterPredicate for the
// model). SQL narrows by rating and required tags cheaply; the shared predicate then
// applies every condition exactly like the renderer's live filter does.
async function getSmartItems(filter = {}) {
    const f = normalizeFilter(filter);
    const includeNames = f.tags.filter(t => !t.exclude).map(t => t.name);

    const where = { rating: { [Op.gte]: f.ratingMin, [Op.lte]: f.ratingMax } };

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

    const items = await Item.findAll({
        where,
        include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
        order: [['order', 'ASC']],
    });

    const now = Math.floor(Date.now() / 1000);
    const plain = items
        .map(item => ({
            ...item.toJSON(),
            tags: item.tags.map(t => t.name),
            ...itemUrls(item),
        }))
        .filter(p => matchItem(p, f, now));

    return { collections: [], items: plain };
}

module.exports = { getSmartItems };
