const http = require('../http');

/**
 * Hentai2Read — the rebuilt site (2026): every page carries its data as Inertia
 * JSON (<script data-page="app">), so lists, books and readers are read from
 * that instead of the markup.
 *
 *   /browse[/<sort>][/page-N]                 lists (no query)
 *   /search?q=&with=1,2&without=3&sort=&page= search; with / without — tag ids
 *   /search/tags                              every tag: [{ id, name, count }]
 *   /original/<id>                            a book (redirects to its own page)
 *   /<artist|character|…>/<id>?page=N         books of an artist / character…
 *   /reader/<id>-<slug>/<chapterId>           a chapter: images + sizes
 *
 * Gallery id = the book number; chapter id = the chapter number on the site.
 */
const BASE = 'https://hentai2read.com';

// Sorts: the path of the list without a query, the value for the search.
const SORTS = [
    { id: 'latest', label: 'Обновлённые', path: '', search: 'latest' },
    { id: 'newest', label: 'Новые', path: '/newest', search: 'newest' },
    { id: 'most-viewed', label: 'Популярные', path: '/most-viewed', search: 'most-viewed' },
    { id: 'top-rated', label: 'По рейтингу', path: '/top-rated', search: 'top-rated' },
    { id: 'yesterday', label: 'Топ за день', path: '/yesterday', search: 'most-viewed' },
    { id: 'last-week', label: 'Топ за неделю', path: '/last-week', search: 'most-viewed' },
    { id: 'last-month', label: 'Топ за месяц', path: '/last-month', search: 'most-viewed' },
    { id: 'alphabetical', label: 'А–Я', path: '/alphabetical', search: 'alphabetical' },
];
// Site tag kinds → library tag categories (1 artist, 3 parody, 4 character, 5 meta, 0 general)
const TYPE = { artist: 1, group: 1, parody: 3, character: 4, language: 5, category: 5, content: 0 };
// Kinds searched by tag id (with / without); the others have a page of their own.
const SEARCHABLE = new Set(['content', 'category', 'tag']);

// Cloudflare stops the app's plain requests on most pages (it tells them from a
// browser by their headers) but lets a real page through: then the page is loaded
// in a hidden window of the manga session, where the check passes by itself, and
// the data is read from there. After one such stop the window is used straight
// away for a while.
const WINDOW_FOR = 10 * 60 * 1000;
let useWindowUntil = 0;

// In the page: the Inertia JSON once it's there (the check page comes first and
// reloads into the real one); a JSON endpoint is read as the page text.
const READ_SCRIPT = `new Promise(resolve => {
    const t0 = Date.now();
    const look = () => {
        const s = document.querySelector('script[data-page="app"]');
        if (s) return resolve(s.textContent);
        const pre = document.body && document.body.innerText.trim();
        if (pre && /^[\[{]/.test(pre)) return resolve(pre);
        if (Date.now() - t0 > 20000) return resolve(null);
        setTimeout(look, 300);
    };
    look();
})`;

async function viaWindow(url) {
    let BrowserWindow;
    try { ({ BrowserWindow } = require('electron')); } catch { /* not in Electron */ }
    if (typeof BrowserWindow !== 'function') return null;   // tests, scripts
    const { loadPage } = require('../browserPage');
    for (let attempt = 0; attempt < 3; attempt++) {
        const r = await loadPage(url, { referrer: `${BASE}/`, script: READ_SCRIPT, timeout: 45000 }).catch(() => null);
        if (r?.value) return r.value;
        // The check reloaded the page under the script: once more, now with its cookie.
    }
    throw new Error('Hentai2Read: страница не открылась (проверка Cloudflare). Откройте сайт кнопкой «Сайт» и попробуйте снова');
}

// Raw text of a page / endpoint, past Cloudflare when needed.
async function fetchText(url, opts = {}) {
    if (Date.now() >= useWindowUntil) {
        try {
            const { body } = await http.text(url, { referer: `${BASE}/`, ...opts });
            return body;
        } catch (e) {
            if (e.code !== 'CF_CHALLENGE') throw e;
            useWindowUntil = Date.now() + WINDOW_FOR;
        }
    }
    const text = await viaWindow(url);
    if (text == null) throw new Error('Сайт закрыт проверкой Cloudflare — откройте его кнопкой «Сайт» и пройдите проверку');
    return text;
}

async function pageData(path) {
    const text = await fetchText(path.startsWith('http') ? path : `${BASE}${path}`);
    // From a plain request: the whole HTML; from the window: the JSON itself.
    const m = text.match(/<script[^>]*data-page="app"[^>]*>([\s\S]*?)<\/script>/);
    const json = m ? m[1] : /^\s*\{/.test(text) ? text : null;
    if (!json) throw new Error('Hentai2Read: страница без данных (сайт изменился или проверка браузера)');
    return JSON.parse(json);
}

// Reader links need the book's slug: remembered from lists and books.
const slugs = new Map();   // book id → "73135-the-slug"
const remember = (url) => {
    const m = String(url || '').match(/\/(?:reader\/|[a-z-]+\/)(\d+)-([^/?#]+)/i);
    if (m) slugs.set(m[1], `${m[1]}-${m[2]}`);
};

const toCard = (b) => {
    remember(b.url);
    return {
        id: String(b.id),
        title: b.title || `#${b.id}`,
        cover: b.cover || null,
        pages: b.pageCount || null,
        chapters: b.chapters > 1 ? b.chapters : null,
        category: b.typeLabel || null,
        rating: b.rating || null,
        url: `${BASE}${b.url}`,
        tags: (b.tags || []).map(t => (Array.isArray(t) ? t[1] : t?.name)).filter(Boolean).slice(0, 12),
    };
};
const listOf = (books, page) => ({
    items: (books?.data || []).map(toCard),
    page,
    pages: books?.lastPage || null,
    hasMore: page < (books?.lastPage || 0),
    total: books?.total ?? null,
    next: page + 1,
});

let tagCache = null;   // { at, list }
async function tagList() {
    if (tagCache && Date.now() - tagCache.at < 6 * 3600 * 1000) return tagCache.list;
    const list = JSON.parse(await fetchText(`${BASE}/search/tags`, { headers: { Accept: 'application/json' } }));
    tagCache = { at: Date.now(), list: (Array.isArray(list) ? list : []).map(t => ({ type: 'content', id: t.id, name: t.name, count: t.count ?? null })) };
    return tagCache.list;
}
async function tagId(f) {
    if (f.id) return f.id;
    const hit = (await tagList().catch(() => [])).find(t => t.name.toLowerCase() === String(f.name).toLowerCase());
    return hit?.id || null;
}

const TAG_GROUPS = [{ type: 'content', label: 'Теги', browse: true }];

async function browseTags(type) {
    const items = type === 'content' ? await tagList() : [];
    return { items: [...items].sort((a, b) => (b.count || 0) - (a.count || 0)), page: 1, pages: 1, hasMore: false };
}

async function suggest(text, { type = null, limit = 20 } = {}) {
    const q = String(text || '').trim();
    if (!q) return [];
    const out = [];
    if (/^\d{2,7}$/.test(q)) out.push({ kind: 'gallery', id: q, title: `Книга #${q}` });
    const norm = q.toLowerCase();
    (await tagList().catch(() => []))
        .filter(t => t.name.toLowerCase().includes(norm))
        .sort((a, b) => (a.name.toLowerCase().startsWith(norm) ? 0 : 1) - (b.name.toLowerCase().startsWith(norm) ? 0 : 1) || (b.count || 0) - (a.count || 0))
        .slice(0, limit)
        .forEach(t => out.push({ kind: 'tag', ...t }));
    if (!type && q.length >= 3) {
        const found = await search({ query: q, page: 1 }).catch(() => ({ items: [] }));
        found.items.slice(0, 6).forEach(m => out.push({ kind: 'gallery', id: m.id, title: m.title, cover: m.cover }));
    }
    return out;
}

async function search({ query = '', page = 1, sort = 'latest', filters = [] } = {}) {
    const s = SORTS.find(x => x.id === sort) || SORTS[0];
    const q = query.trim();
    const withIds = [], withoutIds = [];
    let own = null;   // an artist / character / … page
    for (const f of filters || []) {
        if (!SEARCHABLE.has(f.type) && f.id && !f.exclude && !own) { own = f; continue; }
        const id = await tagId(f);
        if (id) (f.exclude ? withoutIds : withIds).push(id);
    }
    // Books of one artist / character / parody: its own page (only it, no other filters).
    if (own && !q && !withIds.length && !withoutIds.length) {
        const j = await pageData(`/${own.type}/${own.id}${page > 1 ? `?page=${page}` : ''}`);
        return listOf(j.props.books, page);
    }
    if (!q && !withIds.length && !withoutIds.length) {
        const j = await pageData(`/browse${s.path}${page > 1 ? `/page-${page}` : ''}`);
        return listOf(j.props.books, page);
    }
    const p = new URLSearchParams();
    if (q) p.set('q', own ? `${q} ${own.name}` : q);
    else if (own) p.set('q', own.name);
    if (withIds.length) p.set('with', withIds.join(','));
    if (withoutIds.length) p.set('without', withoutIds.join(','));
    if (s.search && !(q && s.id === 'latest')) p.set('sort', s.search);   // with a query "latest" → best match
    if (page > 1) p.set('page', String(page));
    const j = await pageData(`/search?${p}`);
    return listOf(j.props.books, page);
}

async function gallery(id) {
    const j = await pageData(`/original/${encodeURIComponent(id)}`);
    const b = j.props.book;
    remember(b.url);
    const tags = [
        ...(b.tags || []).map(t => ({ name: t.name, type: t.type || 'content', id: t.id })),
        ...(b.groups || []).flatMap(g => (g.tags || []).map(t => ({ name: t.name, type: t.type || g.type, id: t.id }))),
    ].filter(t => t.name);
    const language = tags.find(t => t.type === 'language')?.name || null;
    // The site lists chapters newest first.
    const list = [...(j.props.chapters || [])].reverse();
    list.forEach(c => remember(c.url));
    const chapters = list.map(c => ({
        id: String(c.id),
        title: list.length > 1 ? (c.title || `Глава ${c.number}`) : '',
        pages: null,
    }));
    return {
        source: 'hentai2read',
        id: String(b.id),
        title: b.title || `#${b.id}`,
        altTitle: b.alt || '',
        cover: b.cover || null,
        url: `${BASE}${b.url}`,
        description: b.description || '',
        tags,
        language,
        category: b.type?.label || null,
        rating: j.props.stats?.rating || null,
        pages: chapters.length === 1 ? (j.props.preview?.total || null) : null,
        chapters,
    };
}

async function chapterPages(id, chapterId) {
    if (!slugs.has(String(id))) await gallery(id);
    const slug = slugs.get(String(id)) || String(id);
    const j = await pageData(`/reader/${slug}/${encodeURIComponent(chapterId)}`);
    const sizes = j.props.sizes || [];
    return (j.props.images || []).map((url, i) => ({ url, w: sizes[i]?.[0] || 0, h: sizes[i]?.[1] || 0 }));
}

module.exports = {
    id: 'hentai2read',
    name: 'Hentai2Read',
    home: BASE,
    sorts: SORTS.map(({ id, label }) => ({ id, label })),
    tagTypes: TYPE,
    searchHint: 'название или номер книги; теги — из подсказок',
    matchUrl(url) {
        // A book (/original|doujinshi|imageset|video/<id>-…) or its reader (/reader/<id>-…);
        // not an artist / tag page (/artist/<id>).
        const m = String(url).match(/hentai2read\.com\/(?:reader|original|doujinshi|imageset|videos?)\/(\d+)(?:-[^/?#]*)?(?:[/?#]|$)/i);
        return m ? m[1] : null;
    },
    urlOf: (id) => `${BASE}/original/${id}`,
    tagGroups: TAG_GROUPS,
    browseTags,
    suggest,
    search,
    gallery,
    chapterPages,
    imageRequest: (url) => ({ url, referer: `${BASE}/` }),
    _parse: { toCard, listOf, remember, slugs },
};
