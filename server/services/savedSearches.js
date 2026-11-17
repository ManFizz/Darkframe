const sequelize = require('../database');
const SavedSearch = require('../models/SavedSearch');

const SORTS = ['new', 'score', 'random'];
const RATINGS = ['any', 'safe', 'questionable', 'explicit'];

// Tags lower-cased, de-duplicated and sorted, so "a b" and "b a" are the same search.
function normalize(q = {}) {
    const tags = [...new Set(String(Array.isArray(q.tags) ? q.tags.join(' ') : q.tags || '')
        .split(/\s+/).map(t => t.trim().toLowerCase()).filter(Boolean))];
    const minScore = Math.max(0, Math.round(Number(q.minScore) || 0));
    const sort = SORTS.includes(q.sort) ? q.sort : 'new';
    const rating = RATINGS.includes(q.rating) ? q.rating : 'any';
    const key = [[...tags].sort().join(' '), minScore, sort, rating].join('|');
    return { tags: tags.join(' '), minScore, sort, rating, key };
}

const list = () => SavedSearch.findAll({ order: [['position', 'ASC'], ['id', 'ASC']], raw: true });

async function add(source, query, title = null) {
    const n = normalize(query);
    const existing = await SavedSearch.findOne({ where: { source, key: n.key }, raw: true });
    if (existing) return { ok: true, id: existing.id, existed: true, list: await list() };
    const last = await SavedSearch.max('position', { where: { source } });
    const row = await SavedSearch.create({
        source, ...n,
        title: title ? String(title).slice(0, 256) : null,
        position: (Number(last) || 0) + 1,
        createdAt: Math.floor(Date.now() / 1000),
    });
    return { ok: true, id: row.id, existed: false, list: await list() };
}

async function remove(id) {
    await SavedSearch.destroy({ where: { id } });
    return list();
}

// Restores a removed search exactly (undo).
async function restore(row) {
    const { id, ...rest } = row || {};
    if (!rest.key || rest.source == null) return list();
    await SavedSearch.findOrCreate({ where: { source: rest.source, key: rest.key }, defaults: rest });
    return list();
}

async function update(id, patch = {}) {
    const allowed = {};
    if ('title' in patch) allowed.title = patch.title ? String(patch.title).slice(0, 256) : null;
    if ('lastTotal' in patch) allowed.lastTotal = patch.lastTotal == null ? null : Math.round(Number(patch.lastTotal) || 0);
    if ('lastOpenedAt' in patch) allowed.lastOpenedAt = Math.round(Number(patch.lastOpenedAt) || 0);
    if (Object.keys(allowed).length) await SavedSearch.update(allowed, { where: { id } });
    return list();
}

async function reorder(source, ids = []) {
    await sequelize.transaction(async (t) => {
        for (let i = 0; i < ids.length; i++) {
            await SavedSearch.update({ position: i + 1 }, { where: { id: ids[i], source }, transaction: t });
        }
    });
    return list();
}

module.exports = { normalize, list, add, remove, restore, update, reorder };
