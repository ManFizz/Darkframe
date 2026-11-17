// Reddit: the Upvoted and Saved tabs of a profile (new Reddit and old.reddit).
// Posts come from Reddit's JSON with the page's own logged-in session.

const { gm, retrying, sleep } = require('../core/http');
const app = require('../core/app');
const redgifs = require('./redgifs');

const unescape = (u) => (u ? String(u).replace(/&amp;/g, '&') : u);
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
const pathOf = (u) => { try { return new URL(u).pathname; } catch { return ''; } };
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const MIME_EXT = { 'image/jpg': 'jpg', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const postUrl = (id) => `https://www.reddit.com/comments/${id}/`;

// Reddit's JSON, same origin, with the session cookie. Waits out rate limits.
async function reddit(url, onWait) {
    const res = await retrying(async () => {
        const r = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
        r.retryAfter = Number(r.headers.get('retry-after')) || Number(r.headers.get('x-ratelimit-reset')) || 0;
        return r;
    }, { what: 'Reddit', onWait });
    if (!res.ok) throw new Error(`Reddit ответил HTTP ${res.status}`);
    const remaining = Number(res.headers.get('x-ratelimit-remaining'));
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    const json = await res.json();
    if (Number.isFinite(remaining) && remaining < 3 && reset > 0) {
        onWait?.(`Лимит запросов Reddit почти исчерпан, пауза ${Math.ceil(reset)} с…`);
        await sleep(reset * 1000 + 500);
    }
    return json;
}

// The best stream of a kind ('video' / 'audio') in a DASH manifest → absolute link.
function bestInMpd(xml, kind, base) {
    let best = null;
    for (const set of String(xml).match(/<AdaptationSet[\s\S]*?<\/AdaptationSet>/g) || []) {
        const head = /<AdaptationSet[^>]*>/.exec(set)[0];
        const isKind = new RegExp(`(contentType|mimeType)="${kind}`).test(head) || new RegExp(`<Representation[^>]*mimeType="${kind}`).test(set);
        if (!isKind) continue;
        for (const rep of set.match(/<Representation[\s\S]*?<\/Representation>/g) || []) {
            const bw = Number(/bandwidth="(\d+)"/.exec(rep)?.[1] || 0);
            const u = /<BaseURL>([^<]+)<\/BaseURL>/.exec(rep)?.[1]?.trim();
            if (u && (!best || bw > best.bw)) best = { bw, u };
        }
    }
    return best ? new URL(best.u, base).href : null;
}

// v.redd.it: video and sound are separate DASH streams. The best of each is read
// from the manifest; the app downloads both and joins them.
async function redditVideo({ fallbackUrl, dashUrl, noAudio }) {
    const base = /^https?:\/\/v\.redd\.it\/[^/]+\//i.exec(fallbackUrl || dashUrl || '')?.[0] || null;
    let video = fallbackUrl ? fallbackUrl.split('?')[0] : null;
    let audio = [];
    if (dashUrl && base) {
        try {
            const r = await gm('GET', dashUrl, { timeout: 20000 });
            if (r.status === 200) {
                video = bestInMpd(r.text, 'video', base) || video;
                const a = bestInMpd(r.text, 'audio', base);
                if (a) audio = [a];
            }
        } catch (e) { console.warn('[DF-reddit] DASH manifest', e.message); }
    }
    if (!video) return null;
    if (noAudio) return { url: video };
    if (!audio.length && base) audio = ['DASH_AUDIO_128.mp4', 'DASH_AUDIO_64.mp4', 'DASH_audio.mp4'].map(f => base + f);
    return { url: video, audioUrl: audio };
}

// One entry of media_metadata (a gallery picture, a picture inside a text post).
async function metadataItem(meta) {
    if (!meta || meta.status !== 'valid') return null;
    if (meta.e === 'Image') {
        const ext = MIME_EXT[meta.m];
        return { url: ext ? `https://i.redd.it/${meta.id}.${ext}` : unescape(meta.s?.u) };
    }
    if (meta.e === 'AnimatedImage') {
        return { url: meta.id && meta.m === 'image/gif' ? `https://i.redd.it/${meta.id}.gif` : unescape(meta.s?.gif || meta.s?.mp4) };
    }
    if (meta.e === 'RedditVideo' && meta.dashUrl) return redditVideo({ dashUrl: unescape(meta.dashUrl) });
    return null;
}

// The files of a post → { files: [{ url, audioUrl? }] } or { skip: reason }.
async function postMedia(p) {
    const src = p.crosspost_parent_list?.[0] || p;

    const meta = src.media_metadata;
    if (meta && (src.is_gallery || src.is_self)) {
        const ids = src.gallery_data?.items?.map(i => i.media_id) || Object.keys(meta);
        const files = [];
        for (const id of ids) {
            const f = await metadataItem(meta[id] && { id, ...meta[id] });
            if (f?.url) files.push(f);
        }
        if (files.length) return { files };
    }

    const rv = src.secure_media?.reddit_video || src.media?.reddit_video;
    if (rv?.fallback_url || rv?.dash_url) {
        const f = await redditVideo({
            fallbackUrl: unescape(rv.fallback_url), dashUrl: unescape(rv.dash_url),
            noAudio: rv.is_gif || rv.has_audio === false,
        });
        if (f) return { files: [f] };
    }

    if (src.is_self) return { skip: 'текстовых' };

    const url = unescape(src.url_overridden_by_dest || src.url || '');
    const host = hostOf(url);
    const preview = src.preview;
    const previewVideo = unescape(preview?.reddit_video_preview?.fallback_url);

    if (/(^|\.)redgifs\.com$/.test(host)) {
        const f = await redgifs.fileUrl(url).catch(() => null);
        if (f) return { files: [{ url: f }] };
        if (previewVideo) return { files: [{ url: previewVideo }] };
    }
    if (host === 'i.imgur.com' && /\.gifv$/i.test(url)) return { files: [{ url: url.replace(/\.gifv$/i, '.mp4') }] };
    if (IMAGE_EXT.test(pathOf(url)) || host === 'i.redd.it') return { files: [{ url }] };
    if (/\.mp4$/i.test(pathOf(url))) return { files: [{ url }] };
    if (previewVideo) return { files: [{ url: previewVideo }] };
    // A picture on a page (imgur without an extension…): the largest preview.
    if (src.post_hint === 'image' && preview?.images?.[0]?.source?.url) return { files: [{ url: unescape(preview.images[0].source.url) }] };
    return { skip: 'без медиа' };
}

// Every file of one post → the app.
async function savePost(p, ctx) {
    const media = await postMedia(p);
    if (media.skip) return { result: 'skip', reason: media.skip };
    const n = media.files.length;
    let saved = 0, failed = 0, error = '';
    for (let i = 0; i < n; i++) {
        const f = media.files[i];
        const out = await app.add({
            url: f.url,
            audioUrl: f.audioUrl?.length ? f.audioUrl : undefined,
            sourceUrl: `https://www.reddit.com${p.permalink}`,
            title: n > 1 ? `${p.title} (${i + 1}/${n})` : p.title,
            createdAt: Math.floor(p.created_utc),
            collectionId: ctx.collectionId(),
        });
        if (out.result === 'saved') saved++;
        else if (out.result === 'failed') { failed++; error = out.error; }
    }
    if (failed === n) return { result: 'failed', error };
    if (failed) return { result: 'partial', error };
    return { result: saved ? 'saved' : 'exists' };
}

// Post id of a post element (new Reddit's shreddit-post, old Reddit's .thing).
function postIdOf(el) {
    const raw = el.getAttribute('id') || el.getAttribute('thingid') || el.getAttribute('data-fullname') || '';
    let m = /^t3_([a-z0-9]+)$/i.exec(raw);
    if (m) return m[1].toLowerCase();
    const link = el.getAttribute('permalink') || el.getAttribute('data-permalink')
        || el.querySelector('a[href*="/comments/"]')?.getAttribute('href') || '';
    m = /\/comments\/([a-z0-9]+)/i.exec(link);
    return m ? m[1].toLowerCase() : null;
}

module.exports = {
    id: 'reddit',
    name: 'Reddit',
    hosts: ['www.reddit.com', 'old.reddit.com', 'new.reddit.com'],
    connect: ['v.redd.it'],
    side: 'right',

    postMedia, bestInMpd,   // for tests

    // Only the profile's Upvoted / Saved tabs.
    page(loc) {
        const m = /^\/(?:user|u)\/([^/]+)\/(upvoted|saved)\/?/i.exec(loc.pathname);
        if (!m) return null;
        const user = decodeURIComponent(m[1]);
        const tab = m[2].toLowerCase();
        return { label: tab === 'upvoted' ? 'Upvoted' : 'Saved', all: 'Скачать всё', user, tab };
    },

    items() {
        const out = [];
        const seen = new Set();
        for (const el of document.querySelectorAll('shreddit-post, div.thing.link[data-fullname^="t3_"], article')) {
            if (el.tagName === 'ARTICLE' && el.querySelector('shreddit-post')) continue;   // its shreddit-post is used
            const id = postIdOf(el);
            if (!id) continue;
            const old = el.classList.contains('thing');
            const box = el.tagName === 'SHREDDIT-POST' ? (el.closest('article') || el) : el;
            if (seen.has(box)) continue;
            seen.add(box);
            const sep = box.nextElementSibling;
            out.push({
                id, box,
                alsoHide: sep && sep.tagName === 'HR' ? [sep] : [],
                mount: old
                    ? (btn) => { const li = document.createElement('li'); li.append(btn); (el.querySelector('.flat-list.buttons') || el).append(li); }
                    : box !== el
                        ? null   // overlay on the article
                        : (btn) => { const h = document.createElement('div'); h.className = 'dfr-item-holder'; h.append(btn); el.parentNode.insertBefore(h, el); },
            });
        }
        return out;
    },

    sourceUrl: postUrl,

    async save(id, ctx) {
        const j = await reddit(`${location.origin}/by_id/t3_${id}.json?raw_json=1`, ctx.status);
        const post = j?.data?.children?.[0]?.data;
        if (!post) return { result: 'failed', error: 'пост не найден' };
        return savePost(post, ctx);
    },

    async list(page, ctx) {
        let after = null;
        do {
            const q = `limit=100&raw_json=1${after ? `&after=${after}` : ''}${page.tab === 'saved' ? '&type=links' : ''}`;
            const j = await reddit(`${location.origin}/user/${encodeURIComponent(page.user)}/${page.tab}.json?${q}`, ctx.status);
            ctx.run.c.page++;
            const children = j?.data?.children || [];
            after = j?.data?.after || null;
            const posts = children.filter(ch => ch.kind === 't3').map(ch => ch.data);
            if (children.length > posts.length) ctx.run.skip('комментариев', children.length - posts.length);
            const more = await ctx.take(posts.map(p => ({ id: p.id, save: () => savePost(p, ctx) })));
            if (!more) return;
            if (after) await ctx.pause();
        } while (after);
    },
};
