/**
 * Online manga sources. Each one implements:
 *   search({ query, page, sort, next }) → { items: [card], hasMore, next, total }
 *   gallery(id) → { title, cover, url, tags: [{ name, type }], language, chapters: [{ id, title, pages|null }] }
 *   chapterPages?(id, chapterId) → [{ url, w, h, thumb?, resolve? }]
 *   resolveImage?(url) → { url, referer, retry }  — when page URLs point at viewer pages
 *   imageRequest?(url) → { url, referer }
 *   matchUrl(url) → id | null,  urlOf(id) → page URL
 */
const list = [
    require('./nhentai'),
    require('./ehentai'),
    require('./allhentai'),
    require('./mangadex'),
];
const byId = new Map(list.map(s => [s.id, s]));

function get(id) {
    const s = byId.get(id);
    if (!s) throw new Error(`Неизвестный источник: ${id}`);
    return s;
}

// A gallery / manga link of any known source → { source, id }.
function matchUrl(url) {
    for (const s of list) {
        const id = s.matchUrl(url);
        if (id) return { source: s.id, id };
    }
    return null;
}

// Same gallery whatever the domain / link form.
const keyOf = (source, id) => `${source}:${String(id).toLowerCase()}`;
function keyOfUrl(url) {
    const m = matchUrl(url);
    return m ? keyOf(m.source, m.id) : null;
}

const describe = () => list.map(s => ({
    id: s.id, name: s.name, home: s.home, sorts: s.sorts, login: !!s.login, searchHint: s.searchHint || '',
}));

module.exports = { list, get, matchUrl, keyOf, keyOfUrl, describe };
