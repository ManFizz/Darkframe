const { Op, fn, col } = require('sequelize');
const ViewHistory = require('../models/ViewHistory');

const now = () => Math.floor(Date.now() / 1000);

// Upsert on (section, key): re-viewing bumps the timestamp / count and refreshes the
// snapshot instead of creating a duplicate row.
async function recordView({ section, key, data } = {}) {
    if (section == null || !key) return { ok: false };
    const t = now();
    const payload = JSON.stringify(data || {});

    const existing = await ViewHistory.findOne({ where: { section, key } });
    if (existing) {
        await existing.update({
            data: payload,
            lastViewedAt: t,
            viewCount: (existing.viewCount || 1) + 1,
        });
    } else {
        await ViewHistory.create({
            section, key, data: payload,
            firstViewedAt: t, lastViewedAt: t, viewCount: 1,
        });
    }
    return { ok: true };
}

async function getHistory({ section = null, limit = 500 } = {}) {
    const where = {};
    if (section != null) where.section = section;

    const rows = await ViewHistory.findAll({
        where,
        order: [['lastViewedAt', 'DESC']],
        limit,
    });

    return rows.map(r => {
        let data = {};
        try { data = JSON.parse(r.data); } catch { /* ignore malformed */ }
        return {
            historyId: r.id,
            section: r.section,
            key: r.key,
            viewCount: r.viewCount,
            lastViewedAt: r.lastViewedAt,
            firstViewedAt: r.firstViewedAt,
            data,
        };
    });
}

// Sections that actually have history, with counts — drives the section selector.
async function getHistorySections() {
    const rows = await ViewHistory.findAll({
        attributes: ['section', [fn('COUNT', col('id')), 'count']],
        group: ['section'],
        order: [['section', 'ASC']],
    });
    return rows.map(r => ({ section: r.section, count: Number(r.get('count')) }));
}

async function clearHistory({ section = null } = {}) {
    const where = {};
    if (section != null) where.section = section;
    const count = await ViewHistory.destroy({ where });
    return { ok: true, count };
}

async function removeHistory({ ids = [] } = {}) {
    if (!ids.length) return { ok: true, count: 0 };
    const count = await ViewHistory.destroy({ where: { id: { [Op.in]: ids } } });
    return { ok: true, count };
}

module.exports = { recordView, getHistory, getHistorySections, clearHistory, removeHistory };
