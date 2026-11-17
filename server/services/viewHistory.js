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

// Which of `keys` (in one section) were ever viewed — the history is never pruned on
// its own, only by hand on the history page.
async function viewedKeys({ section, keys = [] } = {}) {
    if (section == null || !keys.length) return [];
    const out = [];
    for (let i = 0; i < keys.length; i += 500) {   // SQLite caps bound parameters
        const rows = await ViewHistory.findAll({
            where: { section, key: { [Op.in]: keys.slice(i, i + 500) } },
            attributes: ['key'], raw: true,
        });
        rows.forEach(r => out.push(r.key));
    }
    return out;
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

module.exports = { recordView, getHistory, getHistorySections, viewedKeys, clearHistory, removeHistory };
