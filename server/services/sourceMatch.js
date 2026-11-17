const { Op } = require('sequelize');

/**
 * "Which of these source links are already in the library?" — for userscripts that
 * hide what was already downloaded (POST /api/has).
 *
 * The same page reaches us spelled differently: http / https, a trailing slash or
 * not, www / old / new / np. reddit, a post link with or without the title slug or
 * the subreddit, redd.it short links. A Reddit post or a redgifs clip is recognised
 * by its id alone; any other link by its exact spelling up to these small differences.
 */

const REDDIT_HOST = /^(?:[a-z0-9-]+\.)*reddit\.com$/i;

// Reddit post id (base36, lowercase) of a post link, or null.
function redditPostId(url) {
    let u;
    try { u = new URL(String(url || '').trim()); } catch { return null; }
    const host = u.hostname.toLowerCase();
    if (host === 'redd.it') {
        const m = /^\/([a-z0-9]+)\/?$/i.exec(u.pathname);
        return m ? m[1].toLowerCase() : null;
    }
    if (!REDDIT_HOST.test(host)) return null;
    const m = /\/comments\/([a-z0-9]+)(?:\/|$)/i.exec(u.pathname);
    return m ? m[1].toLowerCase() : null;
}

const REDGIFS_HOST = /^(?:[a-z0-9-]+\.)*redgifs\.com$/i;

// redgifs clip id (lowercase) of a watch / embed / poster link, or null.
// www.redgifs.com/watch/<id>, /ifr/<id>, i.redgifs.com/i/<id>.jpg
function redgifsId(url) {
    let u;
    try { u = new URL(String(url || '').trim()); } catch { return null; }
    if (!REDGIFS_HOST.test(u.hostname)) return null;
    const m = /^\/(?:watch|ifr|i)\/([a-z]+)(?:[.\/-]|$)/i.exec(u.pathname);
    return m ? m[1].toLowerCase() : null;
}

// Sites whose links are matched by an id. `like(id)` narrows the query; the id is
// then read back from each row, so a longer id that merely contains it is no match.
const BY_ID = [
    { idOf: redditPostId, like: (id) => [`%/comments/${id}/%`, `%/comments/${id}`] },
    { idOf: redgifsId,    like: (id) => [`%redgifs.com/%${id}%`] },
];

// The spellings of one ordinary link we treat as the same: scheme, trailing slash.
function urlVariants(url) {
    const s = String(url || '').trim();
    if (!/^https?:\/\//i.test(s)) return s ? [s] : [];
    const rest = s.replace(/^https?:\/\//i, '');
    const bare = rest.replace(/\/+$/, '');
    const out = new Set();
    for (const scheme of ['https://', 'http://']) {
        out.add(scheme + bare);
        out.add(scheme + bare + '/');
    }
    return [...out];
}

/**
 * `urls` → the subset (as given) that some item's sourceUrl points at. Trashed
 * items count too: what the user threw away shouldn't come back by itself.
 */
async function findPresentSources(urls) {
    const Item = require('../models/Item');
    const list = [...new Set((Array.isArray(urls) ? urls : []).map(u => String(u || '').trim()).filter(Boolean))];
    const present = new Set();

    // Reddit / redgifs: by id, one query per chunk. Ids are [a-z0-9] only: nothing to
    // escape for LIKE (which is case-insensitive in SQLite, as the ids are).
    const plain = [];
    const groups = BY_ID.map(() => new Map());   // per site: id → [input urls]
    for (const u of list) {
        const k = BY_ID.findIndex(s => s.idOf(u));
        if (k < 0) { plain.push(u); continue; }
        const id = BY_ID[k].idOf(u);
        (groups[k].get(id) || groups[k].set(id, []).get(id)).push(u);
    }

    for (let k = 0; k < BY_ID.length; k++) {
        const { idOf, like } = BY_ID[k];
        const byId = groups[k];
        const ids = [...byId.keys()];
        for (let i = 0; i < ids.length; i += 100) {
            const rows = await Item.unscoped().findAll({
                attributes: ['sourceUrl'],
                where: { [Op.or]: ids.slice(i, i + 100).flatMap(id => like(id).map(p => ({ sourceUrl: { [Op.like]: p } }))) },
                raw: true,
            });
            for (const r of rows) {
                const id = idOf(r.sourceUrl);
                if (id && byId.has(id)) byId.get(id).forEach(u => present.add(u));
            }
        }
    }

    // Everything else: exact match on a few spellings.
    const variantOf = new Map();   // variant → [input urls]
    for (const u of plain) {
        for (const v of urlVariants(u)) (variantOf.get(v) || variantOf.set(v, []).get(v)).push(u);
    }
    const variants = [...variantOf.keys()];
    for (let i = 0; i < variants.length; i += 400) {
        const rows = await Item.unscoped().findAll({
            attributes: ['sourceUrl'],
            where: { sourceUrl: { [Op.in]: variants.slice(i, i + 400) } },
            raw: true,
        });
        for (const r of rows) (variantOf.get(r.sourceUrl) || []).forEach(u => present.add(u));
    }

    return list.filter(u => present.has(u));
}

module.exports = { redditPostId, redgifsId, urlVariants, findPresentSources };
