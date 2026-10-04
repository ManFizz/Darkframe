const http = require('../http');

/**
 * MangaDex — public JSON API (manga, chapters, the at-home image servers).
 * Ordinary manga / manhwa; chapters in the preferred languages.
 * Gallery id = manga UUID; chapter id = chapter UUID.
 */
const API = 'https://api.mangadex.org';
const SITE = 'https://mangadex.org';
const LANGS = ['ru', 'en'];
const RATINGS = ['safe', 'suggestive', 'erotica', 'pornographic'];

const SORTS = [
    { id: 'followedCount', label: 'Популярные' },
    { id: 'latestUploadedChapter', label: 'Обновлённые' },
    { id: 'createdAt', label: 'Новые' },
    { id: 'rating', label: 'По рейтингу' },
];
const TYPE = { author: 1, artist: 1, genre: 0, theme: 0, format: 5, content: 5 };

const pickTitle = (t = {}, alt = []) => t.ru || t.en || Object.values(t)[0] || alt.map(a => a.ru || a.en).find(Boolean) || '';
const coverOf = (m) => {
    const rel = (m.relationships || []).find(r => r.type === 'cover_art');
    return rel?.attributes?.fileName ? `https://uploads.mangadex.org/covers/${m.id}/${rel.attributes.fileName}.256.jpg` : null;
};

// ─── Tags (one list for the whole site) and authors ────────────────────────────
let allTags = null;
async function tagList() {
    if (allTags) return allTags;
    const r = await http.json(`${API}/manga/tag`);
    allTags = (r.data || []).map(t => ({ type: t.attributes.group, id: t.id, name: t.attributes.name?.en || '' })).filter(t => t.name)
        .sort((a, b) => a.name.localeCompare(b.name));
    return allTags;
}
async function findTag(f) {
    if (f.id) return f;
    const hit = (await tagList()).find(t => t.name.toLowerCase() === String(f.name).toLowerCase());
    return hit ? { ...f, ...hit } : null;
}
async function authors(q) {
    const r = await http.json(`${API}/author?name=${encodeURIComponent(q)}&limit=10`).catch(() => ({}));
    return (r.data || []).map(a => ({ type: 'author', id: a.id, name: a.attributes?.name }));
}

const TAG_GROUPS = [
    { type: 'genre', label: 'Жанры', browse: true },
    { type: 'theme', label: 'Темы', browse: true },
    { type: 'format', label: 'Формат', browse: true },
    { type: 'content', label: 'Контент', browse: true },
    { type: 'author', label: 'Авторы' },
];

async function browseTags(type) {
    const items = (await tagList()).filter(t => t.type === type);
    return { items, page: 1, pages: 1, hasMore: false };
}

async function suggest(text, { type = null, limit = 25 } = {}) {
    const q = String(text || '').trim();
    if (!q) return [];
    const norm = q.toLowerCase();
    const tags = type === 'author' ? [] : (await tagList().catch(() => [])).filter(t => (!type || t.type === type) && t.name.toLowerCase().includes(norm));
    const [people, titles] = await Promise.all([
        !type || type === 'author' ? authors(q) : [],
        !type ? search({ query: q, page: 1 }).catch(() => ({ items: [] })) : { items: [] },
    ]);
    return [
        ...[...tags, ...people].slice(0, limit).map(t => ({ kind: 'tag', ...t })),
        ...titles.items.slice(0, 6).map(m => ({ kind: 'gallery', id: m.id, title: m.title, cover: m.cover })),
    ];
}

async function search({ query = '', page = 1, sort = 'followedCount', filters = [] } = {}) {
    const p = new URLSearchParams({ limit: '24', offset: String((page - 1) * 24) });
    if (query.trim()) p.set('title', query.trim());
    for (const f0 of filters) {
        if (f0.type === 'author' || f0.type === 'artist') {
            const id = f0.id || (await authors(f0.name))[0]?.id;
            if (!f0.exclude && id) p.append('authorOrArtist', id);
            continue;
        }
        const f = await findTag(f0).catch(() => null);
        if (f) p.append(f.exclude ? 'excludedTags[]' : 'includedTags[]', f.id);
    }
    p.append('includes[]', 'cover_art');
    RATINGS.forEach(r => p.append('contentRating[]', r));
    LANGS.forEach(l => p.append('availableTranslatedLanguage[]', l));
    p.set(`order[${sort}]`, 'desc');
    const data = await http.json(`${API}/manga?${p}`);
    const items = (data.data || []).map(m => ({
        id: m.id,
        title: pickTitle(m.attributes.title, m.attributes.altTitles),
        cover: coverOf(m),
        pages: null,
        url: `${SITE}/title/${m.id}`,
        tags: (m.attributes.tags || []).map(t => t.attributes?.name?.en).filter(Boolean).slice(0, 10),
    }));
    return { items, page, pages: Math.ceil((data.total || 0) / 24) || null, hasMore: data.offset + data.limit < data.total, total: data.total, next: page + 1 };
}

async function gallery(id) {
    const p = new URLSearchParams();
    ['cover_art', 'author', 'artist'].forEach(i => p.append('includes[]', i));
    const m = (await http.json(`${API}/manga/${id}?${p}`)).data;
    const tags = [
        ...(m.attributes.tags || []).map(t => ({ name: t.attributes?.name?.en, type: t.attributes?.group || 'genre' })),
        ...(m.relationships || []).filter(r => r.type === 'author' || r.type === 'artist').map(r => ({ name: r.attributes?.name, type: r.type })),
    ].filter(t => t.name);

    // Chapters in the preferred languages, one per chapter number (first language wins).
    const feed = [];
    for (let offset = 0; offset < 5000; offset += 500) {
        const q = new URLSearchParams({ limit: '500', offset: String(offset), 'order[volume]': 'asc', 'order[chapter]': 'asc' });
        LANGS.forEach(l => q.append('translatedLanguage[]', l));
        RATINGS.forEach(r => q.append('contentRating[]', r));
        const res = await http.json(`${API}/manga/${id}/feed?${q}`);
        feed.push(...(res.data || []));
        if (feed.length >= res.total || !res.data?.length) break;
    }
    const byNum = new Map();
    for (const c of feed) {
        if (c.attributes.externalUrl || !c.attributes.pages) continue;
        const key = `${c.attributes.volume || ''}:${c.attributes.chapter || c.id}`;
        const cur = byNum.get(key);
        if (!cur || LANGS.indexOf(c.attributes.translatedLanguage) < LANGS.indexOf(cur.attributes.translatedLanguage)) byNum.set(key, c);
    }
    const chapters = [...byNum.values()].map(c => ({
        id: c.id,
        title: [c.attributes.volume ? `Том ${c.attributes.volume}` : null, c.attributes.chapter ? `Глава ${c.attributes.chapter}` : null, c.attributes.title].filter(Boolean).join(' · ') || 'Глава',
        language: c.attributes.translatedLanguage,
        pages: null,
    }));
    return {
        source: 'mangadex',
        id,
        title: pickTitle(m.attributes.title, m.attributes.altTitles),
        altTitle: Object.values(m.attributes.title || {})[0] || '',
        cover: coverOf(m),
        url: `${SITE}/title/${id}`,
        description: m.attributes.description?.ru || m.attributes.description?.en || '',
        tags,
        language: chapters[0]?.language || null,
        // Japanese manga read right to left; manhwa / manhua and western comics left
        // to right; "Long Strip" titles are webtoons.
        reading: {
            direction: m.attributes.originalLanguage === 'ja' ? 'rtl' : 'ltr',
            ...((m.attributes.tags || []).some(t => t.attributes?.name?.en === 'Long Strip') ? { mode: 'vertical' } : {}),
        },
        pages: null,
        chapters,
    };
}

async function chapterPages(_id, chapterId) {
    const r = await http.json(`${API}/at-home/server/${chapterId}`);
    return (r.chapter?.data || []).map(f => ({ url: `${r.baseUrl}/data/${r.chapter.hash}/${f}`, w: 0, h: 0 }));
}

module.exports = {
    id: 'mangadex',
    name: 'MangaDex',
    home: SITE,
    sorts: SORTS,
    tagTypes: TYPE,
    searchHint: 'название манги',
    matchUrl(url) {
        const m = String(url).match(/mangadex\.org\/title\/([0-9a-f-]{36})/i);
        return m ? m[1] : null;
    },
    urlOf: (id) => `${SITE}/title/${id}`,
    tagGroups: TAG_GROUPS,
    browseTags,
    suggest,
    search,
    gallery,
    chapterPages,
    imageRequest: (url) => ({ url, referer: `${SITE}/` }),
};
