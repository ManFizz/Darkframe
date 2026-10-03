const http = require('../http');

/**
 * AllHentai (the ReadManga family engine). The domain changes now and then —
 * allhentai.ru always redirects to the current one. A guest session cookie is
 * needed for the catalog; chapter pages are shown only to signed-in users (the
 * person signs in once in the site window, cookies stay in the manga session).
 *
 * Gallery id = the manga slug ("some_title"); chapter id = "/slug/volN/M".
 */
const ENTRY = 'https://allhentai.ru/';
let base = null;
let baseAt = 0;

async function origin() {
    if (base && Date.now() - baseAt < 6 * 3600 * 1000) return base;
    try {
        base = new URL(await http.finalUrl(ENTRY)).origin;
    } catch {
        base = base || 'https://20.allhen.online';
    }
    baseAt = Date.now();
    return base;
}

const SORTS = [
    { id: 'RATING', label: 'По рейтингу' },
    { id: 'POPULARITY', label: 'Популярные' },
    { id: 'DATE_UPDATE', label: 'Обновлённые' },
    { id: 'DATE_CREATE', label: 'Новые' },
    { id: 'VIEWS_SHORT', label: 'Просмотры' },
];
const TYPE = { genre: 0, tag: 0, category: 5, person: 1, author: 1 };
const PAGE = 50;

async function search({ query = '', page = 1, sort = 'RATING' } = {}) {
    const b = await origin();
    const params = new URLSearchParams({ q: query.trim(), offset: String((page - 1) * PAGE), sortType: sort });
    const data = await http.json(`${b}/api/catalog/search?${params}`, {
        referer: `${b}/search/advanced`, headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    });
    const items = (data.list || []).map(e => ({
        id: e.elementId?.linkName,
        title: e.name,
        cover: e.picUrl,
        pages: null,
        chapters: e.chaptersCount,
        url: `${b}/${e.elementId?.linkName}`,
        rating: e.rating?.rate ?? null,
        tags: (e.elements || []).map(x => x.name || x.title).filter(Boolean).slice(0, 12),
    })).filter(i => i.id);
    return { items, page, hasMore: (data.offset || 0) + (data.list?.length || 0) < (data.total || 0), total: data.total ?? null, next: page + 1 };
}

function parseManga(html, slug, b) {
    const title = http.stripTags(html.match(/<h1 class="cr-hero-names__main[^"]*">([\s\S]*?)<\/h1>/)?.[1] || '') || slug;
    const altBlock = html.match(/<h3 class="cr-hero-names__alt[^"]*"[\s\S]*?<\/h3>/)?.[0] || '';
    const alt = [...altBlock.matchAll(/<span>([^<]+)<\/span>/g)].map(m => http.decode(m[1]).trim()).filter(Boolean);
    const coverTag = html.match(/<img[^>]*class="cr-hero-poster__img"[^>]*>/)?.[0] || html.match(/<img[^>]*cr-hero-poster__img[^>]*>/)?.[0] || '';
    const cover = http.attr(coverTag, 'src');
    const description = http.stripTags(html.match(/<div class="cr-description__content[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '');
    const tags = [];
    for (const m of html.matchAll(/<a[^>]*href="\/list\/(genre|tag|category|person)\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
        const name = http.stripTags(m[2]);
        if (name && !tags.some(t => t.name === name)) tags.push({ name, type: m[1] });
    }
    // Chapter rows of the table (the "read the first chapter" button is a chapter-link too).
    const chapters = [];
    for (const row of html.match(/<tr class="item-row"[\s\S]*?<\/tr>/g) || []) {
        const m = row.match(/<a href="(\/[^"]+\/vol(\d+)\/([\d.]+))"[^>]*>([\s\S]*?)<\/a>/);
        if (!m || chapters.some(c => c.id === m[1])) continue;
        chapters.push({ id: m[1], vol: Number(m[2]), num: Number(m[3]), title: http.stripTags(m[4].replace(/<sup>[\s\S]*?<\/sup>/g, '')) || `Том ${m[2]} · ${m[3]}`, pages: null });
    }
    chapters.sort((x, y) => x.vol - y.vol || x.num - y.num);
    chapters.forEach(c => { delete c.vol; delete c.num; });
    return { title, altTitle: alt.join(' / '), cover, description, tags, chapters, url: `${b}/${slug}` };
}

async function gallery(slug) {
    const b = await origin();
    await http.text(`${b}/`, { allowError: true });   // guest session cookie
    const { body } = await http.text(`${b}/${slug}`, { referer: `${b}/` });
    const m = parseManga(body, slug, b);
    return { source: 'allhentai', id: slug, ...m, language: 'russian', pages: null };
}

// A JS array literal of strings / numbers / nested arrays, read without eval
// (it comes from a web page).
function parseLiteral(src) {
    let i = 0;
    const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
    const value = () => {
        ws();
        const c = src[i];
        if (c === '[') {
            i++;
            const out = [];
            ws();
            if (src[i] === ']') { i++; return out; }
            for (;;) {
                out.push(value());
                ws();
                if (src[i] === ',') { i++; ws(); if (src[i] === ']') { i++; return out; } continue; }
                if (src[i] === ']') { i++; return out; }
                throw new Error('bad array');
            }
        }
        if (c === '"' || c === "'") {
            i++;
            let s = '';
            while (i < src.length && src[i] !== c) {
                if (src[i] === '\\') { s += src[i + 1]; i += 2; } else s += src[i++];
            }
            i++;
            return s;
        }
        const m = src.slice(i).match(/^(-?\d+(?:\.\d+)?|true|false|null|undefined)/);
        if (!m) throw new Error('bad value');
        i += m[0].length;
        return m[0] === 'true' ? true : m[0] === 'false' ? false : /^-?\d/.test(m[0]) ? Number(m[0]) : null;
    };
    try { return value(); } catch { return null; }
}

// rm_h.readerInit(chapterInfo, [[server, '', path, w, h, …], …])
function parseReader(html) {
    const i = html.indexOf('rm_h.readerInit(');
    if (i < 0) return null;
    const s = html.slice(i);
    const a = s.indexOf('[[');
    if (a < 0) return [];
    let d = 0, k = a;
    for (; k < s.length; k++) {
        if (s[k] === '[') d++;
        else if (s[k] === ']') { d--; if (!d) break; }
    }
    const list = parseLiteral(s.slice(a, k + 1));
    if (!Array.isArray(list)) return [];
    return list.filter(Array.isArray).map(x => ({ url: `${x[0] || ''}${x[1] || ''}${x[2] || ''}`, w: Number(x[3]) || 0, h: Number(x[4]) || 0 }));
}

const SIGNED_IN = '!!window.current_user_id';
const isSiteHost = (u) => { try { return /allhen|allhentai/i.test(new URL(u).hostname); } catch { return false; } };

// The sign-in window is on the site and the page knows the user → signed in.
// The session lives on that domain: use it from now on.
async function signedIn(win) {
    const url = win.webContents.getURL();
    if (!isSiteHost(url)) return false;
    const ok = !!(await win.webContents.executeJavaScript(SIGNED_IN).catch(() => false));
    if (ok) { base = new URL(url).origin; baseAt = Date.now(); }
    return ok;
}

// Signed in? (a real page load — the site decides it from its own session)
async function checkLogin() {
    const b = await origin();
    const page = await require('../browserPage').loadPage(`${b}/`, { script: SIGNED_IN });
    if (page && isSiteHost(page.url)) { base = new URL(page.url).origin; baseAt = Date.now(); }
    return page ? !!page.value : false;
}

const realPages = (pages, b) => pages
    .filter(p => !/\/static\/deleted/.test(p.url))
    .map(p => ({ ...p, url: p.url.startsWith('/') ? b + p.url : p.url }));

async function chapterPages(slug, chapterId) {
    const b = await origin();
    const url = `${b}${chapterId}?mtr=true`;
    const { body } = await http.text(url, { referer: `${b}/${slug}`, allowError: true });
    let pages = parseReader(body);
    let real = pages ? realPages(pages, b) : [];
    // Guest view: the same page the way the browser (signed in) sees it.
    if (!real.length) {
        const page = await require('../browserPage').loadPage(url, { referrer: `${b}/${slug}` }).catch(() => null);
        if (page) {
            pages = parseReader(page.html) ?? pages;
            real = pages ? realPages(pages, b) : [];
        }
    }
    if (pages == null) throw new Error('Глава не открылась — возможно, нужен вход на сайт');
    if (!real.length) {
        const err = new Error('Страницы видны только после входа на сайте — нажмите «Войти» и войдите в аккаунт');
        err.code = 'LOGIN';
        throw err;
    }
    return real;
}

module.exports = {
    id: 'allhentai',
    name: 'AllHentai',
    get home() { return base || ENTRY; },
    sorts: SORTS,
    tagTypes: TYPE,
    login: true,
    signedIn,
    checkLogin,
    loginUrl: async () => `${await origin()}/internal/auth`,
    searchHint: 'название (рус. / англ. / оригинал)',
    matchUrl(url) {
        const m = String(url).match(/(?:allhentai|allhen)\.[a-z.]+\/([a-z0-9_]+)(?:\/|$|\?)/i);
        return m && !['list', 'search', 'internal', 'user'].includes(m[1]) ? m[1] : null;
    },
    urlOf: (slug) => `${base || 'https://allhentai.ru'}/${slug}`,
    search,
    gallery,
    chapterPages: (id, chapterId) => chapterPages(id, chapterId),
    imageRequest: (url) => ({ url, referer: `${base || ENTRY}` }),
    _parse: { parseManga, parseReader, parseLiteral },
};
