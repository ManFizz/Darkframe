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
    const next = html.match(/id="dnext" href="[^"]*[?&]next=(\d+)/)?.[1] || null;
    const total = Number((html.match(/Found (?:about )?([\d,]+) results?/)?.[1] || '').replace(/,/g, '')) || null;
    return { items, next, total };
}

async function search({ query = '', page = 1, next = null } = {}) {
    const params = new URLSearchParams();
    if (query.trim()) params.set('f_search', query.trim());
    if (next) params.set('next', next);
    const { body } = await http.text(`${BASE}/?${params}`, { headers: H });
    const r = parseSearch(body);
    return { items: r.items, page, hasMore: !!r.next, next: r.next, total: r.total };
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
    search,
    gallery,
    chapterPages,
    resolveImage,
    imageRequest: null,
    _parse: { parseSearch, parsePageLinks, parseViewer },
};
