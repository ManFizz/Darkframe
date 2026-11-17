const sequelize = require('../database');
const { Item, ItemTag } = require('../models/associations');
const { withTagNames } = require('./itemTags');

/**
 * Undo / redo for library edits (Ctrl+Z / Ctrl+Y).
 *
 * Every recorded change keeps a snapshot of what it is about to overwrite: the
 * touched fields of the touched items (and their tags, when tags change). Undo
 * takes a fresh snapshot of the same fields, writes the old one back and moves
 * the fresh one to the redo stack — so one mechanism covers rating, moves, tags,
 * titles, trash / restore and "this item didn't exist yet" (imports, duplicates:
 * their snapshot is simply deletedAt = now, i.e. undo sends them to the trash).
 *
 * Kept in memory for the current library only.
 */
const LIMIT = 100;
let undoStack = [];
let redoStack = [];

const ITEM_FIELDS = () => Object.keys(Item.rawAttributes).filter(f => f !== 'id');

async function capture(ids, fields, withTags = false) {
    const known = ITEM_FIELDS();
    const cols = [...new Set(fields)].filter(f => known.includes(f));
    const rows = await Item.unscoped().findAll({ where: { id: ids }, attributes: ['id', ...cols], raw: true });
    const tags = withTags ? new Map((await withTagNames(rows.map(r => ({ id: r.id })))).map(r => [r.id, r.tags])) : null;
    return {
        fields: cols,
        withTags,
        rows: rows.map(r => {
            const { id, ...values } = r;
            return { id, values, tags: tags ? tags.get(id) || [] : undefined };
        }),
    };
}

async function restore(snap) {
    const { ensureTag } = require('./importService');
    await sequelize.transaction(async (t) => {
        for (const row of snap.rows) {
            if (Object.keys(row.values).length) {
                await Item.unscoped().update(row.values, { where: { id: row.id }, transaction: t });
            }
            if (snap.withTags && row.tags) {
                await ItemTag.destroy({ where: { itemId: row.id }, transaction: t });
                const records = [];
                for (const name of row.tags) records.push(await ensureTag(name, t));
                if (records.length) {
                    await ItemTag.bulkCreate(records.map(tag => ({ itemId: row.id, tagId: tag.id })), { transaction: t });
                }
            }
        }
    });
}

function push(stack, entry) {
    stack.push(entry);
    if (stack.length > LIMIT) stack.shift();
}

function record(label, snap) {
    if (!snap?.rows?.length) return;
    push(undoStack, { label, snap });
    redoStack = [];
}

// Snapshot, run the change, record it. The change's own errors pass through
// (nothing is recorded then).
async function around(label, ids, fields, withTags, change) {
    const snap = ids.length ? await capture(ids, fields, withTags) : null;
    const result = await change();
    record(label, snap);
    return result;
}

// Newly created items: "before" = not there, i.e. in the trash.
function recordCreated(label, ids) {
    if (!ids.length) return;
    const now = Math.floor(Date.now() / 1000);
    record(label, { fields: ['deletedAt'], withTags: false, rows: ids.map(id => ({ id, values: { deletedAt: now } })) });
}

async function step(from, to) {
    const entry = from.pop();
    if (!entry) return null;
    const ids = entry.snap.rows.map(r => r.id);
    const current = await capture(ids, entry.snap.fields, entry.snap.withTags);
    await restore(entry.snap);
    push(to, { label: entry.label, snap: current });
    // Views reload what they show (tags / ratings aren't in the counted fields).
    require('./libraryEvents').broadcast('library:changed', { reload: true, counts: true });
    return { label: entry.label, undo: undoStack.length, redo: redoStack.length };
}

const undo = () => step(undoStack, redoStack);
const redo = () => step(redoStack, undoStack);
const state = () => ({ undo: undoStack.at(-1)?.label || null, redo: redoStack.at(-1)?.label || null });
function clear() { undoStack = []; redoStack = []; }

// Human label for an edit of `fields` on `n` items.
function describe(fields, withTags, n) {
    const parts = [];
    if ('collectionId' in fields) parts.push('перемещение');
    if ('rating' in fields) parts.push('оценка');
    if (withTags) parts.push('теги');
    if ('title' in fields) parts.push('название');
    if ('deletedAt' in fields) parts.push(fields.deletedAt ? 'удаление в корзину' : 'восстановление');
    if (!parts.length) parts.push('изменение');
    const what = parts.join(', ');
    return n > 1 ? `${what} · ${n} файлов` : what;
}

module.exports = { around, record, recordCreated, capture, undo, redo, state, clear, describe };
