const { QueryTypes, Op } = require('sequelize');
const { TAG_TYPES, MODEL_TYPE } = require('../../src/js/shared/tagTypes');
const sequelize = require('../database');
const Tag = require('../models/Tag');
const ItemTag = require('../models/ItemTag');
const TagAlias = require('../models/TagAlias');

const norm = (s) => String(s || '').trim().toLowerCase();

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

async function getAllTags() {
    // Library tags only: anything linked to an item (trashed ones too, count 0) or
    // pinned. Tags also stores the remote-source tag cache (1M+ rows) — never list it.
    // COUNT(i.id) counts only non-trashed items linked to the tag.
    const rows = await sequelize.query(
        `SELECT t.id AS id, t.name AS name, t.pinned AS pinned, COALESCE(t.userType, t.type) AS type, t.userType, COALESCE(c.count, 0) AS count
         FROM Tags t
         LEFT JOIN (
             SELECT it.tagId AS tagId, COUNT(i.id) AS count
             FROM ItemTags it
             LEFT JOIN Items i ON i.id = it.itemId AND i.deletedAt IS NULL
             GROUP BY it.tagId
         ) c ON c.tagId = t.id
         WHERE c.tagId IS NOT NULL OR t.pinned = 1
         ORDER BY t.pinned DESC, count DESC, t.name ASC`,
        { type: QueryTypes.SELECT },
    );
    return rows.map(r => ({ ...r, pinned: !!r.pinned }));
}

async function setPinned(id, pinned) {
    await Tag.update({ pinned: !!pinned }, { where: { id } });
    return { ok: true };
}

async function getPinned() {
    const rows = await Tag.findAll({ where: { pinned: true }, attributes: ['id', 'name', 'type', 'userType'], order: [['name', 'ASC']], raw: true });
    return rows.map(({ userType, ...t }) => ({ ...t, type: userType ?? t.type }));
}

// Move every association from one tag to another, de-duplicating, then drop the source.
async function mergeInto(sourceId, targetId, t) {
    const source = await Tag.findByPk(sourceId, { transaction: t });
    const target = await Tag.findByPk(targetId, { transaction: t });
    if (!source || !target) throw new Error('Тег не найден');
    if (target.userType == null && source.userType != null) await target.update({ userType: source.userType }, { transaction: t });
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

async function setTagType({ ids, type }) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Некорректные теги');
    if (type !== null && (!Number.isInteger(type) || !Object.prototype.hasOwnProperty.call(TAG_TYPES, type))) throw new Error('Некорректный тип');
    await Tag.update({ userType: type }, { where: { id: { [Op.in]: ids } } });
    return { ok: true };
}

// The preview: the file picked by hand while it's still the model's and not in the
// trash, else the best rated (newest) one.
async function getModels() {
    const rows = await sequelize.query(`
        SELECT t.id, t.name, COUNT(i.id) AS count,
          (SELECT i3.id FROM ItemTags it3 JOIN Items i3 ON i3.id = it3.itemId
           WHERE it3.tagId = t.id AND i3.id = t.coverItemId AND i3.deletedAt IS NULL) AS pickedId,
          (SELECT i2.id FROM ItemTags it2 JOIN Items i2 ON i2.id = it2.itemId
           WHERE it2.tagId = t.id AND i2.deletedAt IS NULL
           ORDER BY i2.rating DESC, i2.importedAt DESC, i2.id ASC LIMIT 1) AS autoId
        FROM Tags t JOIN ItemTags it ON it.tagId = t.id
        JOIN Items i ON i.id = it.itemId AND i.deletedAt IS NULL
        WHERE COALESCE(t.userType, t.type) = :modelType
        GROUP BY t.id ORDER BY t.name ASC`,
        { replacements: { modelType: MODEL_TYPE }, type: QueryTypes.SELECT });
    const Item = require('../models/Item');
    const { itemUrls } = require('./itemUrls');
    const out = rows.map(({ pickedId, autoId, ...r }) => ({ ...r, coverId: pickedId || autoId, customCover: !!pickedId }));
    const covers = await Item.findAll({ where: { id: out.map(r => r.coverId).filter(Boolean) }, raw: true });
    const urls = new Map(covers.map(item => [item.id, itemUrls(item).thumbPath]));
    return out.map(r => ({ ...r, thumbUrl: urls.get(r.coverId) || '' }));
}

// A model's files to pick the preview from (best first).
async function getModelFiles(tagId, { limit = 400 } = {}) {
    const id = Number(tagId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Некорректный тег');
    const rows = await sequelize.query(`
        SELECT i.* FROM ItemTags it JOIN Items i ON i.id = it.itemId
        WHERE it.tagId = :id AND i.deletedAt IS NULL
        ORDER BY i.rating DESC, i.importedAt DESC, i.id ASC LIMIT :limit`,
        { replacements: { id, limit: Math.min(1000, Number(limit) || 400) }, type: QueryTypes.SELECT });
    const { itemUrls } = require('./itemUrls');
    return rows.map(i => ({ id: i.id, title: i.title, mimeType: i.mimeType, rating: i.rating, thumbPath: itemUrls(i).thumbPath }));
}

// itemId — one of the model's files; null → back to the automatic preview.
async function setModelCover({ id, itemId = null }) {
    const tag = await Tag.findByPk(Number(id));
    if (!tag) throw new Error('Тег не найден');
    if (itemId != null) {
        const ok = await ItemTag.findOne({ where: { tagId: tag.id, itemId: String(itemId) } });
        if (!ok) throw new Error('Этот файл не относится к модели');
    }
    await tag.update({ coverItemId: itemId == null ? null : String(itemId) });
    return { ok: true };
}

module.exports = {
    setTagType, getModels, getModelFiles, setModelCover,
    resolveAlias, invalidateAliasCache,
    getAllTags, renameTag, mergeTags, deleteTag, setPinned, getPinned,
    getRules, addRule, deleteRule,
};
