// redgifs.com: clips with their tags, creator, description and date.
// Media come from the redgifs API with a temporary (anonymous) token.

const { gm, retrying } = require('../core/http');
const app = require('../core/app');

const RG = 'https://api.redgifs.com/v2';
const PAGE_SIZE = 80;
const watchUrl = (id) => `https://www.redgifs.com/watch/${id}`;
const MIME = { mp4: 'video/mp4', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

let token = null;
async function api(path, onWait = (t) => console.log('[DF-redgifs]', t)) {
    for (let attempt = 0; attempt < 3; attempt++) {
        if (!token) {
            const t = await gm('GET', `${RG}/auth/temporary`, { timeout: 20000 });
            token = t.json?.token || null;
            if (!token) throw new Error(`redgifs не выдал токен (HTTP ${t.status})`);
        }
        const r = await retrying(async () => {
            const res = await gm('GET', RG + path, { timeout: 30000, headers: { Authorization: `Bearer ${token}` } });
            res.retryAfter = Number(res.header('retry-after')) || Number(res.header('x-ratelimit-reset')) || 0;
            return res;
        }, { what: 'redgifs', onWait });
        if (r.status === 401 || r.status === 403) { token = null; continue; }
        if (r.status !== 200 || !r.json) throw new Error(`redgifs ответил HTTP ${r.status}`);
        return r.json;
    }
    throw new Error('redgifs не принимает токен');
}

const idOf = (url) => /redgifs\.com\/(?:watch|ifr|i)\/([a-z]+)/i.exec(url || '')?.[1]?.toLowerCase() || null;

// A redgifs link → the clip's file link (for other sites that link to redgifs).
async function fileUrl(url) {
    const id = idOf(url);
    if (!id) return null;
    const j = await api(`/gifs/${id}`);
    return j.gif?.urls?.hd || j.gif?.urls?.sd || null;
}

// What the library gets for one clip.
function fields(gif, settings, collectionId, part) {
    const description = String(gif.description || '').trim();
    const firstLine = description.split('\n')[0].trim();
    let title = firstLine.length > 150 ? `${firstLine.slice(0, 147)}…` : firstLine;
    if (!title) title = gif.userName ? `${gif.userName} · ${gif.id}` : gif.id;
    if (part) title += ` (${part.i}/${part.n})`;

    const tags = (gif.tags || []).filter(Boolean).map(t => String(t).toLowerCase());
    const niches = (gif.niches || []).filter(Boolean);
    if (settings.nicheTags.get()) niches.forEach(n => tags.push(String(n).toLowerCase()));
    const ct = settings.creatorType.get();
    if (gif.userName && ct !== 'none') tags.push(ct ? { name: gif.userName, type: Number(ct) } : gif.userName);

    const notes = [
        description && description !== title ? description : '',
        gif.userName ? `Автор: ${gif.userName} (https://www.redgifs.com/users/${gif.userName})` : '',
        niches.length ? `Ниши: ${niches.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    return { sourceUrl: watchUrl(gif.id), title, tags, notes, createdAt: gif.createDate || undefined, collectionId };
}

// The app fetches the file itself; should redgifs refuse it, the browser downloads
// it and hands over the bytes.
async function sendFile(gif, meta) {
    const url = gif.urls?.hd || gif.urls?.sd;
    if (!url) return { result: 'failed', error: `нет ссылки на файл (${gif.id})` };
    const first = await app.add({ url, ...meta });
    if (first.result !== 'failed') return first;
    console.warn('[DF-redgifs] the app could not fetch', gif.id, first.error);
    const file = await gm('GET', url, { responseType: 'arraybuffer', timeout: 10 * 60 * 1000, headers: { Referer: 'https://www.redgifs.com/' } })
        .catch(() => ({ status: 0 }));
    if (file.status !== 200 || !file.response) return { result: 'failed', error: first.error };
    const ext = (/\.([a-z0-9]+)(?:\?|$)/i.exec(url)?.[1] || 'mp4').toLowerCase();
    return app.addBytes(meta, file.response, MIME[ext] || 'video/mp4');
}

// A clip, or every picture of a gallery.
async function saveGif(gif, ctx) {
    let parts = [gif];
    if (gif.gallery) {
        try {
            const g = await api(`/gallery/${encodeURIComponent(gif.gallery)}`, ctx.status);
            if (Array.isArray(g.gifs) && g.gifs.length) parts = g.gifs.map(x => ({ ...gif, ...x, tags: x.tags?.length ? x.tags : gif.tags }));
        } catch (e) { console.warn('[DF-redgifs] gallery', gif.gallery, e.message); }
    }
    let ok = 0, saved = 0, error = '';
    for (let i = 0; i < parts.length; i++) {
        const meta = fields(parts[i], ctx.settings, ctx.collectionId(), parts.length > 1 ? { i: i + 1, n: parts.length } : null);
        const out = await sendFile(parts[i], meta);
        if (out.result === 'failed') error = out.error;
        else { ok++; if (out.result === 'saved') saved++; }
    }
    const ids = [...new Set([gif.id, ...parts.map(p => p.id)].map(x => String(x).toLowerCase()))];
    if (!ok) return { result: 'failed', error };
    if (ok < parts.length) return { result: 'partial', ids, error };
    return { result: saved ? 'saved' : 'exists', ids };
}

module.exports = {
    id: 'redgifs',
    name: 'redgifs',
    hosts: ['www.redgifs.com', 'redgifs.com'],
    connect: ['api.redgifs.com', 'media.redgifs.com', 'thumbs.redgifs.com', 'thumbs2.redgifs.com', 'thumbs3.redgifs.com', 'thumbs4.redgifs.com'],
    side: 'left',
    settings: [
        { key: 'creatorType', label: 'Автор как тег:', type: 'select', default: '1',
          options: [['1', 'категория «Автор»'], ['100', 'категория «Модель»'], ['', 'без категории'], ['none', 'не добавлять']] },
        { key: 'nicheTags', label: 'Ниши тоже как теги', type: 'checkbox', default: false },
    ],

    // also used by the Reddit module
    api, fileUrl, idOf, fields,

    page(loc) {
        const path = loc.pathname;
        const qs = new URLSearchParams(loc.search);
        let m;
        if ((m = /^\/watch\/([a-z]+)/i.exec(path))) {
            return { label: 'Ролик', current: m[1].toLowerCase(), oneLabel: 'Скачать этот ролик', visible: true };
        }
        if ((m = /^\/users\/([^/]+)/i.exec(path))) {
            const user = decodeURIComponent(m[1]);
            return { label: `Автор ${user}`, all: 'Скачать всё у автора', visible: true,
                list: (p) => `/users/${encodeURIComponent(user)}/search?order=new&count=${PAGE_SIZE}&page=${p}` };
        }
        if ((m = /^\/niches\/([^/]+)/i.exec(path))) {
            const niche = decodeURIComponent(m[1]);
            return { label: `Ниша ${niche}`, all: 'Скачать всю нишу', visible: true,
                list: (p) => `/niches/${encodeURIComponent(niche)}/gifs?order=new&count=${PAGE_SIZE}&page=${p}` };
        }
        const tag = /^\/gifs\/([^/]+)/i.exec(path)?.[1];
        const text = (tag && decodeURIComponent(tag)) || qs.get('query') || qs.get('tags') || qs.get('search_text');
        if (/^\/(search|gifs|browse)/i.test(path) && text) {
            return { label: `Поиск «${text}»`, all: 'Скачать весь поиск', visible: true,
                list: (p) => `/gifs/search?search_text=${encodeURIComponent(text)}&order=new&count=${PAGE_SIZE}&page=${p}` };
        }
        return { label: 'Лента', visible: true };
    },

    // A tile with id="gif_<id>", or a link to /watch/<id>.
    items() {
        const out = new Map();   // box → id
        for (const el of document.querySelectorAll('[id^="gif_"]')) {
            const id = /^gif_([a-z]+)$/i.exec(el.id)?.[1];
            if (id && !el.closest('#dfr-panel')) out.set(el, id.toLowerCase());
        }
        for (const a of document.querySelectorAll('a[href*="/watch/"]')) {
            if (a.closest('#dfr-panel') || a.closest('[id^="gif_"]')) continue;
            const id = idOf(new URL(a.getAttribute('href'), location.href).href);
            if (!id) continue;
            const box = a.closest('.tileItem, .GifPreview, [class*="tileItem"], [class*="GifPreview"]') || a;
            if (!out.has(box)) out.set(box, id);
        }
        return [...out].map(([box, id]) => ({ id, box }));
    },

    sourceUrl: watchUrl,

    async save(id, ctx) {
        const j = await api(`/gifs/${encodeURIComponent(id)}?users=yes`, ctx.status);
        if (!j.gif) return { result: 'failed', error: 'ролик не найден' };
        return saveGif(j.gif, ctx);
    },

    async list(page, ctx) {
        if (!page.list) return;
        for (let p = 1; ; p++) {
            const j = await api(page.list(p), ctx.status);
            ctx.run.c.page = p;
            ctx.run.c.pages = j.pages || null;
            if (p === 1 && j.total > 300 && !ctx.confirm(`Здесь ${j.total} роликов. Скачать все (уже скачанные пропускаются)?`)) {
                ctx.run.stopped = true;
                return;
            }
            const gifs = (j.gifs || []).filter(g => g && g.id);
            if (!gifs.length) return;
            const more = await ctx.take(gifs.map(g => ({ id: String(g.id).toLowerCase(), save: () => saveGif(g, ctx) })));
            if (!more || (j.pages && p >= j.pages)) return;
            await ctx.pause();
        }
    },
};
