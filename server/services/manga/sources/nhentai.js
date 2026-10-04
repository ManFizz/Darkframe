const http = require('../http');

/**
 * nhentai — official API v2 (anonymous access: search, lists, galleries, CDN).
 * One gallery = one chapter. Images come straight from the CDN.
 */
const BASE = 'https://nhentai.net';
const API = `${BASE}/api/v2`;

let cdn = null;   // { image_servers, thumb_servers }
async function servers() {
    if (cdn) return cdn;
    try { cdn = await http.json(`${API}/cdn`); }
    catch { cdn = { image_servers: ['https://i1.nhentai.net'], thumb_servers: ['https://t1.nhentai.net'] }; }
    return cdn;
}
const pick = (list, n) => list[Math.abs(n) % list.length];
const img = async (path, n = 0) => `${pick((await servers()).image_servers, n)}/${path}`;
const thumb = async (path, n = 0) => `${pick((await servers()).thumb_servers, n)}/${path}`;

// nhentai tag types → library tag categories (1 artist, 3 parody, 4 character, 5 meta, 0 general)
const TYPE = { artist: 1, group: 1, parody: 3, character: 4, language: 5, category: 5, tag: 0 };

const SORTS = [
    { id: 'date', label: 'Новые' },
    { id: 'popular', label: 'Популярные' },
    { id: 'popular-today', label: 'Популярные за день' },
    { id: 'popular-week', label: 'Популярные за неделю' },
    { id: 'popular-month', label: 'Популярные за месяц' },
];

async function toCard(g, i) {
    return {
        id: String(g.id),
        title: g.english_title || g.japanese_title || `#${g.id}`,
        cover: await thumb(g.thumbnail, i),
        pages: g.num_pages,
        url: `${BASE}/g/${g.id}/`,
        favorites: g.num_favorites,
    };
}

// Filters → nhentai search syntax: tag:"big breasts" -artist:"x"
const token = (f) => `${f.exclude ? '-' : ''}${f.type}:"${String(f.name).replace(/"/g, '')}"`;

async function search({ query = '', page = 1, sort = 'date', filters = [] } = {}) {
    const q = [query.trim(), ...filters.map(token)].filter(Boolean).join(' ');
    const data = q
        ? await http.json(`${API}/search?query=${encodeURIComponent(q)}&sort=${encodeURIComponent(sort)}&page=${page}`)
        : sort !== 'date'
            ? await http.json(`${API}/search?query=${encodeURIComponent('*')}&sort=${encodeURIComponent(sort)}&page=${page}`).catch(() => http.json(`${API}/galleries?page=${page}&per_page=25`))
            : await http.json(`${API}/galleries?page=${page}&per_page=25`);
    const items = await Promise.all((data.result || []).map(toCard));
    return { items, page, pages: data.num_pages || null, hasMore: page < (data.num_pages || 0), total: data.total ?? null, next: page + 1 };
}

// ─── Tags: groups, browsing, autocomplete ──────────────────────────────────────
const TAG_GROUPS = [
    { type: 'tag', label: 'Теги', browse: true },
    { type: 'parody', label: 'Пародии', browse: true },
    { type: 'character', label: 'Персонажи', browse: true },
    { type: 'artist', label: 'Художники', browse: true },
    { type: 'group', label: 'Группы', browse: true },
    { type: 'language', label: 'Языки', browse: true },
    { type: 'category', label: 'Категории', browse: true },
];
const toTag = (t) => ({ type: t.type, name: t.name, id: t.id, count: t.count ?? null });

async function browseTags(type, { page = 1, sort = 'popular' } = {}) {
    const data = await http.json(`${API}/tags/${encodeURIComponent(type)}?sort=${sort === 'name' ? 'name' : 'popular'}&page=${page}&per_page=100`);
    return { items: (data.result || []).map(toTag), page, pages: data.num_pages || 1, hasMore: page < (data.num_pages || 0), total: data.total ?? null };
}

async function suggest(text, { type = null, limit = 20 } = {}) {
    const q = String(text || '').trim();
    if (!q) return [];
    const out = [];
    // A gallery number → that gallery.
    if (/^\d{1,7}$/.test(q)) out.push({ kind: 'gallery', id: q, title: `Галерея #${q}` });
    const tags = await http.json(`${API}/tags/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, ...(type ? { type } : {}), limit }),
    }).catch(() => []);
    (Array.isArray(tags) ? tags : tags.result || []).forEach(t => out.push({ kind: 'tag', ...toTag(t) }));
    return out;
}

async function gallery(id) {
    const g = await http.json(`${API}/galleries/${encodeURIComponent(id)}`);
    const tags = (g.tags || []).map(t => ({ name: t.name, type: t.type }));
    const language = tags.find(t => t.type === 'language' && t.name !== 'translated')?.name || null;
    const pages = await Promise.all((g.pages || []).map(async (p, i) => ({
        url: await img(p.path, i), w: p.width, h: p.height, thumb: p.thumbnail ? await thumb(p.thumbnail, i) : null,
    })));
    return {
        source: 'nhentai',
        id: String(g.id),
        title: g.title?.pretty || g.title?.english || g.title?.japanese || `#${g.id}`,
        altTitle: g.title?.japanese || g.title?.english || '',
        cover: await thumb(g.cover?.path || g.thumbnail?.path || ''),
        url: `${BASE}/g/${g.id}/`,
        tags,
        language,
        pages: g.num_pages,
        uploaded: g.upload_date || null,
        favorites: g.num_favorites,
        chapters: [{ id: 'all', title: '', pages }],
    };
}

module.exports = {
    id: 'nhentai',
    name: 'nhentai',
    home: BASE,
    sorts: SORTS,
    tagTypes: TYPE,
    searchHint: 'теги и названия: «tag:"full color" language:english», -tag:… исключить',
    matchUrl(url) {
        const m = String(url).match(/nhentai\.net\/g\/(\d+)/i);
        return m ? m[1] : null;
    },
    urlOf: (id) => `${BASE}/g/${id}/`,
    tagGroups: TAG_GROUPS,
    browseTags,
    suggest,
    search,
    gallery,
    // Images need nothing special.
    imageRequest: (url) => ({ url, referer: `${BASE}/` }),
};
