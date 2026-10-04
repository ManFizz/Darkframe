const http = require('../http');

/**
 * E-Hentai: search results and gallery thumbnails are HTML, metadata comes from the
 * JSON API (gdata). Every page has its own viewer page (/s/<key>/<gid>-<n>) that
 * holds the actual image URL; pages are resolved one by one when shown or saved
 * (see resolveImage), so opening a gallery is cheap.
 *
 * Gallery id = "<gid>/<token>".
 */
const BASE = 'https://e-hentai.org';
const API = 'https://api.e-hentai.org/api.php';
// Extended list layout + skip the "offensive content" interstitial.
const COOKIES = 'sl=dm_2; nw=1';
const H = { Cookie: COOKIES };

const NS_TYPE = { artist: 1, group: 1, parody: 3, character: 4, language: 5, reclass: 5, other: 0, female: 0, male: 0, mixed: 0, cosplayer: 1, location: 0, temp: 0 };

const SORTS = [{ id: 'date', label: 'Новые' }];

// ─── Search results (extended layout: table.itg.glte) ─────────────────────────
function parseSearch(html) {
    const items = [];
    const rows = html.split(/<tr>(?=<td class="gl1e")/).slice(1);
    for (const row of rows) {
        const link = row.match(/href="https:\/\/e-hentai\.org\/g\/(\d+)\/([0-9a-f]+)\/"/);
        if (!link) continue;
        const cover = row.match(/<img[^>]*\ssrc="([^"]+)"/)?.[1] || null;
        const title = http.stripTags(row.match(/<div class="glink">([\s\S]*?)<\/div>/)?.[1] || '');
        const category = http.stripTags(row.match(/<div class="cn[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '');
        const pages = Number(row.match(/>(\d+) pages?</)?.[1]) || null;
        const tags = [...row.matchAll(/<div class="gt[l]?" title="([^"]+)"/g)].map(m => http.decode(m[1]));
        const language = tags.find(t => t.startsWith('language:') && t !== 'language:translated')?.slice(9) || null;
        items.push({ id: `${link[1]}/${link[2]}`, title, cover, pages, category, language, url: `${BASE}/g/${link[1]}/${link[2]}/`, tags });
    }
    // In the HTML the query string is escaped: "?f_search=…&amp;next=123".
    const next = html.match(/id="dnext" href="[^"]*(?:[?&]|&amp;)next=(\d+)/)?.[1] || null;
    const total = Number((html.match(/Found (?:about )?([\d,]+) results?/)?.[1] || '').replace(/,/g, '')) || null;
    return { items, next, total };
}

// Gallery categories: a bit each; f_cats is the mask of the *hidden* ones.
const CATS = { 'Doujinshi': 2, 'Manga': 4, 'Artist CG': 8, 'Game CG': 16, 'Western': 512, 'Non-H': 256, 'Image Set': 32, 'Cosplay': 64, 'Asian Porn': 128, 'Misc': 1 };
const ALL_CATS = 1023;

function catMask(filters) {
    const cats = filters.filter(f => f.type === 'category' && CATS[f.name]);
    if (!cats.length) return null;
    const on = cats.filter(f => !f.exclude);
    if (on.length) return ALL_CATS - on.reduce((m, f) => m | CATS[f.name], 0);
    return cats.reduce((m, f) => m | CATS[f.name], 0);
}
// Filters → e-hentai syntax: female:"big breasts$" -male:"x$"
const token = (f) => `${f.exclude ? '-' : ''}${f.type}:"${String(f.name).replace(/"/g, '')}$"`;

async function search({ query = '', page = 1, next = null, filters = [] } = {}) {
    const params = new URLSearchParams();
    const q = [query.trim(), ...filters.filter(f => f.type !== 'category').map(token)].filter(Boolean).join(' ');
    if (q) params.set('f_search', q);
    const mask = catMask(filters);
    if (mask != null) params.set('f_cats', String(mask));
    if (next) params.set('next', next);
    const { body } = await http.text(`${BASE}/?${params}`, { headers: H });
    const r = parseSearch(body);
    return { items: r.items, page, hasMore: !!r.next, next: r.next, total: r.total };
}

// ─── Tags ─────────────────────────────────────────────────────────────────────
// E-Hentai has no tag lists — namespaces are searched by name (tagsuggest).
const TAG_GROUPS = [
    { type: 'category', label: 'Категории', browse: true },
    { type: 'female', label: 'Female' },
    { type: 'male', label: 'Male' },
    { type: 'mixed', label: 'Mixed' },
    { type: 'other', label: 'Other' },
    { type: 'parody', label: 'Пародии' },
    { type: 'character', label: 'Персонажи' },
    { type: 'artist', label: 'Художники' },
    { type: 'group', label: 'Группы' },
    { type: 'cosplayer', label: 'Косплееры' },
    { type: 'language', label: 'Языки' },
];

async function browseTags(type) {
    if (type !== 'category') return { items: [], page: 1, pages: 1, hasMore: false };
    return { items: Object.keys(CATS).map(name => ({ type, name })), page: 1, pages: 1, hasMore: false };
}

async function suggest(text, { type = null, limit = 25 } = {}) {
    const q = String(text || '').trim();
    if (q.length < 2) return [];
    const res = await http.json(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'tagsuggest', text: q }),
    }).catch(() => ({}));
    const tags = Object.values(res.tags || {}).map(t => ({ kind: 'tag', type: t.ns, name: t.tn }));
    const cats = Object.keys(CATS).filter(c => c.toLowerCase().includes(q.toLowerCase())).map(name => ({ kind: 'tag', type: 'category', name }));
    return [...cats, ...tags].filter(t => !type || t.type === type).slice(0, limit);
}

// ─── Gallery ────────────────────────────────────────────────────────────────
async function gdata(gid, token) {
    const res = await http.json(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'gdata', gidlist: [[Number(gid), token]], namespace: 1 }),
    });
    const g = res.gmetadata?.[0];
    if (!g || g.error) throw new Error(g?.error === 'Key missing, or incorrect key provided.' ? 'Галерея не найдена' : (g?.error || 'Галерея не найдена'));
    return g;
}

// The viewer-page links of all pages, in order (gallery pages hold 20 or 40 each).
function parsePageLinks(html) {
    return [...new Set([...html.matchAll(/href="(https:\/\/e-hentai\.org\/s\/[0-9a-f]+\/\d+-(\d+))"/g)].map(m => m[1]))];
}

async function pageLinks(gid, token, count) {
    const links = [];
    for (let p = 0; links.length < count && p < 500; p++) {
        const { body } = await http.text(`${BASE}/g/${gid}/${token}/?p=${p}`, { headers: H });
        const found = parsePageLinks(body).filter(l => !links.includes(l));
        if (!found.length) break;
        links.push(...found);
    }
    return links.sort((a, b) => Number(a.split('-').pop()) - Number(b.split('-').pop()));
}

async function gallery(id) {
    const [gid, token] = String(id).split('/');
    const g = await gdata(gid, token);
    const tags = (g.tags || []).map(t => {
        const i = t.indexOf(':');
        const ns = i > 0 ? t.slice(0, i) : 'other';
        return { name: i > 0 ? t.slice(i + 1) : t, type: ns };
    });
    const language = tags.find(t => t.type === 'language' && t.name !== 'translated')?.name || null;
    return {
        source: 'ehentai',
        id: `${gid}/${token}`,
        title: http.decode(g.title || ''),
        altTitle: http.decode(g.title_jpn || ''),
        cover: g.thumb,
        url: `${BASE}/g/${gid}/${token}/`,
        tags,
        category: g.category,
        language,
        pages: Number(g.filecount) || 0,
        uploaded: Number(g.posted) || null,
        rating: Number(g.rating) || null,
        // Page URLs are collected when the chapter is opened (loadChapter).
        chapters: [{ id: 'all', title: '', pages: null }],
    };
}

async function chapterPages(id) {
    const [gid, token] = String(id).split('/');
    const g = await gdata(gid, token);
    const links = await pageLinks(gid, token, Number(g.filecount) || 0);
    // The reader / downloader fetch these through resolveImage.
    return links.map(l => ({ url: l, w: 0, h: 0, resolve: true }));
}

// /s/ viewer page → the image. `nl` asks for another image server when one fails.
function parseViewer(html) {
    const src = html.match(/<img id="img" src="([^"]+)"/)?.[1] || null;
    const nl = html.match(/onclick="return nl\('([^']+)'\)"/)?.[1] || null;
    const full = html.match(/<a href="([^"]+fullimg[^"]*)"/)?.[1] || null;
    return { src: src && http.decode(src), nl, full: full && http.decode(full) };
}

// The image of a viewer page. When that image server fails, the fetcher calls
// again with `retry` (the page's nl key) to be sent to another one.
async function resolveImage(viewerUrl, { nl = null } = {}) {
    const { body } = await http.text(nl ? `${viewerUrl}?nl=${encodeURIComponent(nl)}` : viewerUrl, { headers: H, referer: `${BASE}/` });
    const v = parseViewer(body);
    if (!v.src) throw new Error('Не удалось получить страницу');
    if (/509\.gif/.test(v.src)) throw new Error('E-Hentai: исчерпан лимит картинок, попробуйте позже');
    return { url: v.src, referer: viewerUrl, retry: v.nl ? { nl: v.nl } : null };
}

module.exports = {
    id: 'ehentai',
    name: 'E-Hentai',
    home: BASE,
    sorts: SORTS,
    tagTypes: NS_TYPE,
    searchHint: 'например: «language:english artist:…» или f:tag$ — синтаксис e-hentai',
    matchUrl(url) {
        const m = String(url).match(/e[x-]hentai\.org\/g\/(\d+)\/([0-9a-f]+)/i);
        return m ? `${m[1]}/${m[2]}` : null;
    },
    urlOf: (id) => `${BASE}/g/${id}/`,
    tagGroups: TAG_GROUPS,
    cursor: true,
    browseTags,
    suggest,
    search,
    gallery,
    chapterPages,
    resolveImage,
    imageRequest: null,
    _parse: { parseSearch, parsePageLinks, parseViewer },
};
