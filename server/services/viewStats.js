const ViewHistory = require('../models/ViewHistory');

// SOURCE_TYPES.LIBRARY — the section library items are recorded under (mediaKey: `lib:<id>`).
const LIBRARY = 6;

/**
 * How often and when each library item was opened in the viewer — for sorting
 * ("most viewed", "not opened for a long time"). One query per item list.
 * Adds { viewCount, lastViewedAt } (0 / null for never opened).
 */
async function attach(items) {
    if (!items?.length) return items;
    const rows = await ViewHistory.findAll({ where: { section: LIBRARY }, attributes: ['key', 'viewCount', 'lastViewedAt'], raw: true });
    const byId = new Map(rows.map(r => [String(r.key).replace(/^lib:/, ''), r]));
    return items.map(it => {
        const v = byId.get(it.id);
        return v ? { ...it, viewCount: v.viewCount || 1, lastViewedAt: v.lastViewedAt || null } : { ...it, viewCount: 0, lastViewedAt: null };
    });
}

module.exports = { attach };
