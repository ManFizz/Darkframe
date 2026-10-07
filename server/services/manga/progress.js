const { Op } = require('sequelize');
const MangaState = require('../../models/MangaState');
const { Item } = require('../../models/associations');
const { itemUrls } = require('../itemUrls');

/**
 * Reading progress of library manga: where the reader stopped (chapter + page,
 * and the position across all pages for the progress bar on tiles), when, and
 * whether it was read to the end.
 */
async function get(itemId) {
    return MangaState.findByPk(itemId, { raw: true });
}

async function save(itemId, { chapter = null, page = 0, position = 0, total = 0 }) {
    const finished = total > 0 && position >= total - 1;
    const row = { itemId, chapter, page, position, total, readAt: Math.floor(Date.now() / 1000) };
    const cur = await MangaState.findByPk(itemId);
    if (cur) await cur.update({ ...row, finished: cur.finished || finished });
    else await MangaState.create({ ...row, finished });
    return get(itemId);
}

async function reset(itemId) {
    await MangaState.destroy({ where: { itemId } });
}

// Library rows → + readPosition / readFinished / readTotal for manga tiles
// (+ new / online chapters of subscriptions).
async function attach(items) {
    const ids = items.filter(i => i.pageCount != null).map(i => i.id);
    if (!ids.length) return items;
    return require('./subscriptions').attach(await attachState(items, ids));
}

async function attachState(items, ids) {
    const states = new Map();
    for (let i = 0; i < ids.length; i += 900) {
        (await MangaState.findAll({ where: { itemId: { [Op.in]: ids.slice(i, i + 900) } }, raw: true }))
            .forEach(s => states.set(s.itemId, s));
    }
    return items.map(it => {
        const s = states.get(it.id);
        return s ? { ...it, readPosition: s.position, readFinished: !!s.finished, readAt: s.readAt, readTotal: s.total } : it;
    });
}

// "Продолжить чтение": started, not finished, most recent first.
async function recent(limit = 30) {
    const states = await MangaState.findAll({ where: { finished: false }, order: [['readAt', 'DESC']], limit: limit * 2, raw: true });
    if (!states.length) return [];
    const items = await Item.findAll({ where: { id: states.map(s => s.itemId) }, raw: true });
    const byId = new Map(items.map(i => [i.id, i]));
    return states.filter(s => byId.has(s.itemId)).slice(0, limit).map(s => {
        const it = byId.get(s.itemId);
        return { ...it, ...itemUrls(it), readPosition: s.position, readAt: s.readAt, readTotal: s.total };
    });
}

module.exports = { get, save, reset, attach, recent };
