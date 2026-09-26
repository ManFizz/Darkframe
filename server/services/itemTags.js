const { QueryTypes } = require('sequelize');
const sequelize = require('../database');

// Tag names for a batch of items, as a Map(itemId → [name]). Two flat queries instead
// of a Sequelize belongsToMany include: materialising the include for thousands of
// items (row dedup + model instances) took seconds and stalled the single DB connection.
async function tagNamesByItem(ids) {
    const map = new Map();
    if (!ids.length) return map;

    const push = (rows) => {
        for (const r of rows) {
            const list = map.get(r.itemId);
            if (list) list.push(r.name); else map.set(r.itemId, [r.name]);
        }
    };

    const SQL = `SELECT it.itemId AS itemId, t.name AS name
                 FROM ItemTags it JOIN Tags t ON t.id = it.tagId`;

    if (ids.length > 3000) {
        // Most of the library anyway — one pass over the whole link table is cheaper
        // than thousands of bound parameters.
        const wanted = new Set(ids);
        push((await sequelize.query(`${SQL} ORDER BY it.rowid`, { type: QueryTypes.SELECT }))
            .filter(r => wanted.has(r.itemId)));
    } else {
        for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            push(await sequelize.query(
                `${SQL} WHERE it.itemId IN (${chunk.map(() => '?').join(',')}) ORDER BY it.rowid`,
                { type: QueryTypes.SELECT, replacements: chunk },
            ));
        }
    }
    return map;
}

// Plain item rows (findAll raw) → the shape the renderer expects, tags included.
async function withTagNames(rows) {
    const tags = await tagNamesByItem(rows.map(r => r.id));
    return rows.map(r => ({ ...r, tags: tags.get(r.id) || [] }));
}

module.exports = { tagNamesByItem, withTagNames };
