const { QueryTypes } = require('sequelize');
const sequelize = require('../database');
const Tag = require('../models/Tag');
const ItemTag = require('../models/ItemTag');
const TagAlias = require('../models/TagAlias');

const norm = (s) => String(s || '').trim().toLowerCase();

// ─── Alias cache (from → to), used by ensureTag on every tag add ──────────────
let aliasMap = null;

async function ensureCache() {
    if (aliasMap) return aliasMap;
    const rows = await TagAlias.findAll({ raw: true });
    aliasMap = new Map(rows.map(r => [r.from, r.to]));
    return aliasMap;
}
function invalidateAliasCache() { aliasMap = null; }

// Resolve a name through the rules (follows chains, guards against loops).
async function resolveAlias(name) {
    const map = await ensureCache();
    let cur = norm(name);
    const seen = new Set();
    while (map.has(cur) && !seen.has(cur)) { seen.add(cur); cur = map.get(cur); }
    return cur;
}

// ─── Tag listing with live-item usage counts ──────────────────────────────────
async function getAllTags() {
    // COUNT(i.id) counts only non-trashed items linked to the tag.
    return sequelize.query(
        `SELECT t.id AS id, t.name AS name, COUNT(i.id) AS count
         FROM Tags t
         LEFT JOIN ItemTags it ON it.tagId = t.id
         LEFT JOIN Items i ON i.id = it.itemId AND i.deletedAt IS NULL
         GROUP BY t.id, t.name
         ORDER BY count DESC, t.name ASC`,
        { type: QueryTypes.SELECT },
    );
}

// Move every association from one tag to another, de-duplicating, then drop the source.
async function mergeInto(sourceId, targetId, t) {
    const rows = await ItemTag.findAll({ where: { tagId: sourceId }, transaction: t });
    for (const row of rows) {
        const clash = await ItemTag.findOne({ where: { itemId: row.itemId, tagId: targetId }, transaction: t });
        if (clash) await ItemTag.destroy({ where: { itemId: row.itemId, tagId: sourceId }, transaction: t });
        else       await ItemTag.update({ tagId: targetId }, { where: { itemId: row.itemId, tagId: sourceId }, transaction: t });
    }
    await Tag.destroy({ where: { id: sourceId }, transaction: t });
}

// Rename (or, if the target name already exists, merge into it).
async function renameTag(id, newName) {
    const name = norm(newName);
    if (!name) throw new Error('empty tag name');
    await sequelize.transaction(async (t) => {
        const existing = await Tag.findOne({ where: { name }, transaction: t });
        if (existing && existing.id !== id) {
            await mergeInto(id, existing.id, t);
        } else {
            await Tag.update({ name }, { where: { id }, transaction: t });
        }
    });
    return { ok: true };
}

async function mergeTags(sourceId, targetId) {
    if (sourceId === targetId) return { ok: true };
    await sequelize.transaction((t) => mergeInto(sourceId, targetId, t));
    return { ok: true };
}

async function deleteTag(id) {
    await sequelize.transaction(async (t) => {
        await ItemTag.destroy({ where: { tagId: id }, transaction: t });
        await Tag.destroy({ where: { id }, transaction: t });
    });
    return { ok: true };
}

// ─── Rules ────────────────────────────────────────────────────────────────────
async function getRules() {
    return TagAlias.findAll({ order: [['from', 'ASC']], raw: true });
}

async function addRule({ from, to, applyExisting = true }) {
    const f = norm(from), tName = norm(to);
    if (!f || !tName) throw new Error('both sides required');
    if (f === tName) throw new Error('from and to are the same');

    const [rule] = await TagAlias.findOrCreate({ where: { from: f }, defaults: { from: f, to: tName } });
    if (rule.to !== tName) await rule.update({ to: tName });
    invalidateAliasCache();

    // Retroactively fold an existing `from` tag into `to`.
    if (applyExisting) {
        const fromTag = await Tag.findOne({ where: { name: f } });
        if (fromTag) await renameTag(fromTag.id, tName);
    }
    return { ok: true };
}

async function deleteRule(id) {
    await TagAlias.destroy({ where: { id } });
    invalidateAliasCache();
    return { ok: true };
}

module.exports = {
    resolveAlias, invalidateAliasCache,
    getAllTags, renameTag, mergeTags, deleteTag,
    getRules, addRule, deleteRule,
};
