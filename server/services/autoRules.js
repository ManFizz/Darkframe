const sequelize = require('../database');
const AutoRule = require('../models/AutoRule');
const { Item, ItemTag } = require('../models/associations');
const ViewHistory = require('../models/ViewHistory');
const { withTagNames } = require('./itemTags');
const { normalizeRules, matchRules, rulesNeedHistory } = require('../../src/js/shared/filterPredicate');
const { SOURCE_TYPES } = require('../../src/js/Constants');

const parse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

function toDto(row) {
    return {
        ...row,
        enabled: !!row.enabled,
        apiOnly: !!row.apiOnly,
        rules: normalizeRules(parse(row.rules, null)) || { op: 'all', items: [] },
        addTags: parse(row.addTags, []),
    };
}

let cache = null;   // enabled rules, invalidated on every change
const invalidate = () => { cache = null; };

async function list() {
    const rows = await AutoRule.findAll({ order: [['position', 'ASC'], ['id', 'ASC']], raw: true });
    return rows.map(toDto);
}

async function save(data = {}) {
    const clean = {
        name: String(data.name || '').slice(0, 256),
        enabled: data.enabled !== false,
        apiOnly: !!data.apiOnly,
        rules: JSON.stringify(normalizeRules(data.rules) || { op: 'all', items: [] }),
        addTags: JSON.stringify([...new Set((data.addTags || []).map(t => String(t).trim().toLowerCase()).filter(Boolean))]),
        collectionId: data.collectionId || null,
        rating: data.rating == null || data.rating === '' ? null : Math.max(0, Math.min(10, Math.round(Number(data.rating)) || 0)) || null,
    };
    if (data.id) await AutoRule.update(clean, { where: { id: data.id } });
    else {
        const last = await AutoRule.max('position');
        await AutoRule.create({ ...clean, position: (Number(last) || 0) + 1, createdAt: Math.floor(Date.now() / 1000) });
    }
    invalidate();
    return list();
}

async function remove(id) {
    await AutoRule.destroy({ where: { id } });
    invalidate();
    return list();
}

async function historyCtx(rules) {
    if (!rules.some(r => rulesNeedHistory(r.rules))) return null;
    const rows = await ViewHistory.findAll({ where: { section: SOURCE_TYPES.LIBRARY }, attributes: ['key', 'lastViewedAt'], raw: true });
    return { lastViewed: new Map(rows.filter(r => r.key.startsWith('lib:')).map(r => [r.key.slice(4), r.lastViewedAt || 0])) };
}

// What a rule would change on one item (null = nothing).
function changesFor(rule, item) {
    const tags = rule.addTags.filter(t => !item.tags.includes(t));
    const collection = rule.collectionId && item.collectionId !== rule.collectionId ? rule.collectionId : null;
    const rating = rule.rating && !item.rating ? rule.rating : null;
    return tags.length || collection || rating ? { tags, collection, rating } : null;
}

async function applyChanges(itemId, ch) {
    // Tags go through the importer's ensureTag so rename rules still apply.
    const { ensureTag } = require('./importService');
    await sequelize.transaction(async (t) => {
        for (const name of ch.tags) {
            const tag = await ensureTag(name, t);
            await ItemTag.findOrCreate({ where: { itemId, tagId: tag.id }, transaction: t });
        }
        const patch = {};
        if (ch.collection) patch.collectionId = ch.collection;
        if (ch.rating) patch.rating = ch.rating;
        if (Object.keys(patch).length) await Item.update(patch, { where: { id: itemId }, transaction: t });
    });
}

/**
 * Run every enabled rule on a freshly imported item. Rules apply in order, each
 * seeing the result of the previous ones. Returns the names of rules that fired.
 */
async function applyOnImport(itemId, { origin = 'app' } = {}) {
    if (!cache) cache = (await list()).filter(r => r.enabled && r.rules.items.length);
    const rules = cache.filter(r => !r.apiOnly || origin === 'api');
    if (!rules.length) return [];

    const [row] = await withTagNames(await Item.findAll({ where: { id: itemId }, raw: true }));
    if (!row) return [];
    const ctx = await historyCtx(rules);
    const now = Math.floor(Date.now() / 1000);
    const fired = [];
    let item = row;
    for (const rule of rules) {
        if (!matchRules(item, rule.rules, now, ctx)) continue;
        const ch = changesFor(rule, item);
        if (!ch) continue;
        await applyChanges(itemId, ch);
        item = {
            ...item,
            tags: [...item.tags, ...ch.tags],
            collectionId: ch.collection || item.collectionId,
            rating: ch.rating || item.rating,
        };
        fired.push(rule.name || `#${rule.id}`);
    }
    return fired;
}

// Existing items a rule matches, and how many of them it would actually change.
async function matchesOf(rule) {
    const rows = await withTagNames(await Item.findAll({ raw: true }));
    const ctx = await historyCtx([rule]);
    const now = Math.floor(Date.now() / 1000);
    const matched = rows.filter(it => matchRules(it, rule.rules, now, ctx));
    return { matched, changes: matched.map(it => ({ id: it.id, ch: changesFor(rule, it) })).filter(x => x.ch) };
}

async function preview(data) {
    const rule = toDto({ ...data, rules: JSON.stringify(data.rules || {}), addTags: JSON.stringify(data.addTags || []) });
    if (!rule.rules.items.length) return { matched: 0, changed: 0 };
    const { matched, changes } = await matchesOf(rule);
    return { matched: matched.length, changed: changes.length };
}

async function applyToExisting(id) {
    const row = await AutoRule.findByPk(id, { raw: true });
    if (!row) return { changed: 0 };
    const rule = toDto(row);
    if (!rule.rules.items.length) return { changed: 0 };
    const { changes } = await matchesOf(rule);
    const journal = require('./undoJournal');
    const snap = await journal.capture(changes.map(c => c.id), ['collectionId', 'order', 'rating'], true);
    for (const { id: itemId, ch } of changes) await applyChanges(itemId, ch);
    journal.record(`правило «${rule.name || '#' + rule.id}» · ${changes.length} файлов`, snap);
    return { changed: changes.length };
}

module.exports = { list, save, remove, preview, applyOnImport, applyToExisting, invalidate };
