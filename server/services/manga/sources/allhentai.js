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
let loggedIn = null;   // known after a sign-in / a check
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

// ─── Filters: genres / categories (fixed lists), tags, parodies, people (by id) ──
const ELEMENT_TYPE = { tag: 40, parody: 11 };
let lists = null;   // { genre: [{ id, name }], category: [...] }, from the advanced search page
let listsAt = 0;

async function filterLists() {
    if (lists && Date.now() - listsAt < 6 * 3600 * 1000) return lists;
    const b = await origin();
    const { body } = await http.text(`${b}/search/advanced`, { referer: `${b}/` });
    const read = (key) => {
        const m = body.match(new RegExp(`window\\.__FILTERS\\.${key}\\s*=\\s*(\\{[^\\n]*?\\});`));
        try { return Object.entries(JSON.parse(m[1])).map(([id, name]) => ({ id: String(id), name: String(name) })); } catch { return []; }
    };
    lists = { genre: read('genre'), category: read('category') };
    listsAt = Date.now();
    return lists;
}

const apiJson = async (path) => {
    const b = await origin();
    return http.json(`${b}${path}`, { referer: `${b}/search/advanced`, headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
};
async function searchElements(type, q) {
    if (type === 'person') {
        const r = await apiJson(`/search/persons?q=${encodeURIComponent(q)}`).catch(() => ({}));
        return (r.results || []).map(x => ({ type, id: String(x.id), name: x.text }));
    }
    const r = await apiJson(`/search/elementsByType?type=${ELEMENT_TYPE[type]}&q=${encodeURIComponent(q)}`).catch(() => ({}));
    return (r.results || []).map(x => ({ type, id: String(x.id), name: x.text }));
}

// A tag from a manga card has a name only — find its id.
async function resolveFilter(f) {
    if (f.id) return f;
    const norm = (s) => String(s).trim().toLowerCase();
    if (f.type === 'genre' || f.type === 'category') {
        const hit = (await filterLists())[f.type].find(x => norm(x.name) === norm(f.name));
        return hit ? { ...f, id: hit.id } : null;
    }
    const type = f.type === 'person' || f.type === 'author' ? 'person' : f.type === 'parody' ? 'parody' : 'tag';
    const found = await searchElements(type, f.name);
    const hit = found.find(x => norm(x.name) === norm(f.name)) || found[0];
    return hit ? { ...f, type, id: hit.id } : null;
}

async function search({ query = '', page = 1, sort = 'RATING', filters = [] } = {}) {
    const b = await origin();
    const params = new URLSearchParams({ q: query.trim(), offset: String((page - 1) * PAGE), sortType: sort });
    for (const f0 of filters) {
        const f = await resolveFilter(f0).catch(() => null);
        if (!f) continue;
        if (f.type === 'person') { if (!f.exclude) params.append('includePersonsIds', f.id); }
        else params.append(f.exclude ? 'excludeElementIds' : 'includeElementIds', f.id);
    }
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
    const total = data.total ?? null;
    return { items, page, pages: total != null ? Math.ceil(total / PAGE) : null, hasMore: (data.offset || 0) + (data.list?.length || 0) < (total || 0), total, next: page + 1 };
}

const TAG_GROUPS = [
    { type: 'genre', label: 'Жанры', browse: true },
    { type: 'category', label: 'Категории', browse: true },
    { type: 'tag', label: 'Теги' },
    { type: 'parody', label: 'Пародии' },
    { type: 'person', label: 'Авторы' },
];

async function browseTags(type) {
    if (type !== 'genre' && type !== 'category') return { items: [], page: 1, pages: 1, hasMore: false };
    const items = (await filterLists())[type].map(x => ({ type, id: x.id, name: x.name }));
    return { items, page: 1, pages: 1, hasMore: false };
}

async function suggest(text, { type = null, limit = 30 } = {}) {
    const q = String(text || '').trim();
    if (!q) return [];
    const norm = q.toLowerCase();
    const want = (t) => !type || type === t;
    const l = await filterLists().catch(() => ({ genre: [], category: [] }));
    const local = ['genre', 'category'].filter(want)
        .flatMap(t => l[t].filter(x => x.name.toLowerCase().includes(norm)).map(x => ({ kind: 'tag', type: t, id: x.id, name: x.name })));
    const remote = await Promise.all([
        want('tag') ? searchElements('tag', q) : [],
        want('parody') ? searchElements('parody', q) : [],
        want('person') ? searchElements('person', q) : [],
        !type ? apiJson(`/search/suggestion?query=${encodeURIComponent(q)}`).catch(() => ({})) : {},
    ]);
    const galleries = (remote[3].suggestions || []).filter(x => x.elementId?.type === 'MANGA' && x.elementId.linkName)
        .slice(0, 6).map(x => ({ kind: 'gallery', id: x.elementId.linkName, title: x.value, cover: x.thumbnail || null }));
    const tags = [...local, ...remote[0], ...remote[1], ...remote[2].slice(0, 8)].map(t => ({ kind: 'tag', ...t }));
    return [...tags.slice(0, limit), ...galleries];
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
    if (ok) { base = new URL(url).origin; baseAt = Date.now(); loggedIn = true; }
    return ok;
}

// Signed in? (a real page load — the site decides it from its own session)
async function checkLogin() {
    const b = await origin();
    const page = await require('../browserPage').loadPage(`${b}/`, { script: SIGNED_IN });
    if (page && isSiteHost(page.url)) { base = new URL(page.url).origin; baseAt = Date.now(); }
    loggedIn = page ? !!page.value : false;
    return loggedIn;
}

const realPages = (pages, b) => pages
    .filter(p => !/\/static\//.test(p.url))
    .map(p => ({ ...p, url: p.url.startsWith('/') ? b + p.url : p.url }));

// Why a chapter shows no pages: structure only (counts, hosts, whether the site
// sees a user) — no page text, no ids.
// What a reader page without the usual page list is made of — structure only:
// address paths, script file names, variable names, element ids / counts, the
// site's own notice boxes. No page text, no titles, no ids of anything.
const PAGE_PROBE = String.raw`(() => {
    const host = (u) => { try { const x = new URL(u, location.href); return x.host + '/' + (x.pathname.split('/')[1] || ''); } catch { return '?'; } };
    const imgs = {};
    document.querySelectorAll('img').forEach(i => { const k = host(i.getAttribute('src') || i.dataset.src || ''); imgs[k] = (imgs[k] || 0) + 1; });
    const inline = [...document.scripts].filter(s => !s.src).map(s => s.textContent).join('\n');
    const vars = [...new Set((inline.match(/(?:window\.|var |let |const )([A-Za-z_$][\w$]{2,40})\s*=/g) || []).map(v => v.replace(/^(window\.|var |let |const )/, '').replace(/\s*=$/, '')))].slice(0, 60);
    const calls = [...new Set(inline.match(/rm_h\.[A-Za-z]+/g) || [])];
    // Page pictures as the page itself shows them (signed-in readers may fill
    // them in from script instead of the readerInit list).
    const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
    const pics = [...document.querySelectorAll('img#mangaPicture, img.manga-img')]
        .map(i => abs(i.getAttribute('data-src') || i.getAttribute('data-original') || i.getAttribute('src') || ''))
        .filter(Boolean);
    // Image addresses anywhere in __PAGE_DATA__ (in order), and its shape.
    const IMG = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;
    const dataUrls = [];
    const shape = (v, d = 0) => {
        if (d > 5) return '…';
        if (Array.isArray(v)) {
            if (v.length >= 3 && v.slice(0, 3).every(x => typeof x === 'string') && IMG.test(v.slice(0, 3).join(''))) dataUrls.push(abs(v.slice(0, 3).join('')));
            else v.forEach(x => shape(x, d + 1));
            return '[' + (v.length ? shape(v[0], d + 1) : '') + ']x' + v.length;
        }
        if (v && typeof v === 'object') return '{' + Object.entries(v).map(([k, x]) => k + ':' + shape(x, d + 1)).join(',') + '}';
        if (typeof v === 'string') { if (IMG.test(v) && /^(https?:)?\//.test(v)) dataUrls.push(abs(v)); return 'str' + v.length; }
        return typeof v;
    };
    let dataShape = null;
    try { dataShape = window.__PAGE_DATA__ ? shape(window.__PAGE_DATA__).slice(0, 1500) : null; } catch { dataShape = 'err'; }
    const kind = (u) => { try { const x = new URL(u); return /\/static\//.test(x.pathname) ? x.pathname.replace(/^.*\/static\//, 'static/') : x.host; } catch { return '?'; } };
    const notices = [...document.querySelectorAll('.alert')]
        .map(e => (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160)).filter(Boolean).slice(0, 6);
    return {
        user: !!window.current_user_id,
        path: location.pathname.split('/').length + ' parts' + (location.search ? ' ?' + [...new URLSearchParams(location.search).keys()].join(',') : ''),
        scripts: [...document.scripts].filter(s => s.src).map(s => s.src.split('/').pop().replace(/-[\w]{6,}(?=\.js)/, '')).slice(0, 30),
        vars, calls, imgs, notices,
        ids: [...document.querySelectorAll('[id]')].map(e => e.id).filter(id => !/\d{4,}/.test(id)).slice(0, 50),
        readerish: [...new Set([...document.querySelectorAll('[class*="reader"], [class*="Reader"], [class*="chapter"]')].flatMap(e => [...e.classList]).filter(c => /reader|chapter/i.test(c)))].slice(0, 30),
        forms: [...document.forms].map(f => { try { return new URL(f.action).pathname; } catch { return '?'; } }),
        dataShape,
        picKinds: pics.map(kind), dataKinds: dataUrls.map(kind),
        pics, dataUrls,
    };
})()`;

function probeLog(url, page) {
    const { siteLog, bare } = require('../siteLog');
    const reqs = (page.requests || []).map(r => { try { const x = new URL(r.url); return `${r.type}:${r.status} ${x.host}${x.pathname}${x.search ? '?' + [...x.searchParams.keys()].join(',') : ''}`; } catch { return '?'; } });
    const { pics, dataUrls, ...shown } = page.value || {};
    siteLog(`probe ${bare(url)} → final ${bare(page.url)}: ${JSON.stringify(shown)} requests=${JSON.stringify(reqs.slice(0, 40))}`);
}

function diagnose(url, html, pages, browserUser) {
    const { siteLog, bare } = require('../siteLog');
    const list = pages || [];
    const deleted = list.filter(p => /\/static\//.test(p.url));
    const u = list.map(p => p.url.match(/[?&]u=(\d+)/)?.[1]).find(x => x != null);
    // What the page addresses look like: site placeholders by file name (they are
    // the site's own images), real pages only by host.
    const kinds = {};
    list.forEach(p => {
        let k;
        try { const x = new URL(p.url, url); k = /\/static\//.test(x.pathname) ? x.pathname.replace(/^.*\/static\//, 'static/') : `${x.host}/…`; } catch { k = '?'; }
        kinds[k] = (kinds[k] || 0) + 1;
    });
    siteLog(`chapter ${bare(url)}: reader=${pages ? list.length : 'none'} placeholders=${deleted.length}`
        + ` user=${u == null ? '?' : u === '0' ? 'guest' : 'signed-in'} browserUser=${browserUser}`
        + ` kinds=${Object.entries(kinds).map(([k, n]) => `${k}×${n}`).join(' ')} len=${(html || '').length}`);
}

async function chapterPages(slug, chapterId) {
    const b = await origin();
    const url = `${b}${chapterId}?mtr=true`;
    const { body } = await http.text(url, { referer: `${b}/${slug}`, allowError: true });
    let pages = parseReader(body);
    let real = pages ? realPages(pages, b) : [];
    let browserUser = null;
    // Guest view: the same page the way the browser (signed in) sees it.
    if (!real.length) {
        const page = await require('../browserPage').loadPage(url, {
            referrer: `${b}/${slug}`, script: PAGE_PROBE, settle: 2500, trackRequests: true,
        }).catch(() => null);
        browserUser = page ? !!page.value?.user : null;
        if (page) {
            pages = parseReader(page.html) ?? pages;
            real = pages ? realPages(pages, b) : [];
            if (!real.length) {
                probeLog(url, page);
                // The pictures the page itself shows / its page data, when they are real.
                const isReal = (u) => u && !/\/static\//.test(u) && !/\/uploads\/(pics|avatars?)\//.test(u);
                const fromData = (page.value?.dataUrls || []).filter(isReal);
                const fromDom = (page.value?.pics || []).filter(isReal);
                const found = [...new Set(fromData.length ? fromData : fromDom)];
                if (found.length) {
                    real = found.map(u => ({ url: u, w: 0, h: 0 }));
                    require('../siteLog').siteLog(`chapter ${require('../siteLog').bare(url)}: pages from ${fromData.length ? 'page data' : 'page pictures'} ×${found.length}`);
                }
            }
        }
    }
    diagnose(url, body, pages, browserUser);
    if (pages == null) throw new Error('Глава не открылась — возможно, нужен вход на сайт');
    if (!real.length) {
        const signedIn = (pages || []).some(p => /[?&]u=[1-9]/.test(p.url)) || browserUser;
        const err = new Error(signedIn
            ? 'Сайт не отдаёт страницы этой главы даже после входа (глава закрыта на сайте или для вашего аккаунта)'
            : 'Страницы видны только после входа на сайте — нажмите «Войти» и войдите в аккаунт');
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
    tagGroups: TAG_GROUPS,
    browseTags,
    suggest,
    login: true,
    get loggedIn() { return loggedIn; },
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
