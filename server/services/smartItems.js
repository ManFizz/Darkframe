const { Op } = require('sequelize');
const Item = require('../models/Item');
const Tag = require('../models/Tag');
const ItemTag = require('../models/ItemTag');
const { itemUrls } = require('./itemUrls');
const { withTagNames } = require('./itemTags');
const { normalizeFilter, matchItem, rulesNeedHistory } = require('../../src/js/shared/filterPredicate');
const ViewHistory = require('../models/ViewHistory');
const { SOURCE_TYPES } = require('../../src/js/Constants');

// Items matching a saved smart-collection filter (see shared/filterPredicate for the
// model). SQL narrows by rating and required tags cheaply; the shared predicate then
// applies every condition exactly like the renderer's live filter does.
async function getSmartItems(filter = {}) {
    // A fixed, ordered list (search by picture results): no filtering.
    if (Array.isArray(filter.ids)) {
        const rows = await withTagNames(await Item.findAll({ where: { id: filter.ids }, raw: true }));
        const byId = new Map(rows.map(r => [r.id, r]));
        const items = filter.ids.map(id => byId.get(id)).filter(Boolean).map(item => ({ ...item, ...itemUrls(item) }));
        return { collections: [], items: await require('./manga/progress').attach(items) };
    }
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

    const items = await withTagNames(await Item.findAll({ where, order: [['order', 'ASC']], raw: true }));

    // "Viewed" conditions need the last view per library item.
    let ctx = null;
    if (rulesNeedHistory(f.rules)) {
        const rows = await ViewHistory.findAll({
            where: { section: SOURCE_TYPES.LIBRARY }, attributes: ['key', 'lastViewedAt'], raw: true,
        });
        ctx = { lastViewed: new Map(rows.filter(r => r.key.startsWith('lib:')).map(r => [r.key.slice(4), r.lastViewedAt || 0])) };
    }

    const now = Math.floor(Date.now() / 1000);
    const plain = items
        .map(item => ({ ...item, ...itemUrls(item) }))
        .filter(p => matchItem(p, f, now, ctx));

    return { collections: [], items: await require('./manga/progress').attach(plain) };
}

module.exports = { getSmartItems };
