import {GetThumbByData} from "@controllers/GalleryController.js";
import {addToGallery, setGallery} from "@controllers/AppInitializerController";
import PrivateData from "@data/private";
import {FILE_TYPES, SOURCE_TYPES} from "@/Constants";
import {rememberKinds} from "./tagKinds";

export const sources = {
    r34: {
        name: "Rule 34",
        mainUrl: "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index",
        tagUrl: "https://api.rule34.xxx/autocomplete.php?q=",
        tagsUrl: "https://api.rule34.xxx/index.php?page=dapi&s=tag&q=index&name=",
        sourceUrl: "https://rule34.xxx/index.php?page=post&s=view&id=",
        remoteType: SOURCE_TYPES.R34,
        tagsLimit: 1,
    },
    gelbooru: {
        name: "Gelbooru",
        mainUrl: "https://gelbooru.com/index.php?page=dapi&s=post&q=index",
        tagUrl: "https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1&limit=8&orderby=count&name_pattern=",
        tagsUrl: "https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1&names=",
        sourceUrl: "https://gelbooru.com/index.php?page=dapi&s=post&q=index&id=",
        remoteType: SOURCE_TYPES.GELBOORU,
        tagsLimit: 100,
    },
    realbooru: {
        name: "Realbooru",
        mainUrl: "https://realbooru.com/index.php?page=dapi&s=post&q=index",
        tagUrl: "https://realbooru.com/index.php?page=dapi&s=tag&q=index&json=1&limit=8&orderby=count&name_pattern=",
        tagsUrl: "https://realbooru.com/index.php?page=dapi&s=tag&q=index&json=1&names=",
        sourceUrl: "https://realbooru.com/index.php?page=dapi&s=post&q=index&id=",
        remoteType: SOURCE_TYPES.REALBOORU,
        tagsLimit: 100,
    },
    // JSON API (not the gelbooru-style dapi): see fetchDanbooru.
    danbooru: {
        name: "Danbooru",
        api: 'danbooru',
        mainUrl: "https://danbooru.donmai.us/posts.json",
        tagUrl: "https://danbooru.donmai.us/autocomplete.json?search[type]=tag_query&limit=8&search[query]=",
        sourceUrl: "https://danbooru.donmai.us/posts/",
        remoteType: SOURCE_TYPES.DANBOORU,
        tagsLimit: 2,
        maxPages: 1000,
    },
};

// Every booru source type the search UI handles.
export const BOORU_TYPES = [SOURCE_TYPES.R34, SOURCE_TYPES.GELBOORU, SOURCE_TYPES.REALBOORU, SOURCE_TYPES.DANBOORU];

export function GetSourceDataById(sourceId) {
    switch(sourceId) {
        case SOURCE_TYPES.R34:
            return sources.r34;
        case SOURCE_TYPES.GELBOORU:
            return sources.gelbooru;
        case SOURCE_TYPES.REALBOORU:
            return sources.realbooru;
        case SOURCE_TYPES.DANBOORU:
            return sources.danbooru;
        case SOURCE_TYPES.FOLDER:
        case SOURCE_TYPES.FAVORITE:
        case SOURCE_TYPES.COLLECTION:
            throw new Error("Unknown source type");
    }
}

export let currentR34Source = sources.r34;

export function updateR34Source(sourceId) {
    if(sourceId === SOURCE_TYPES.R34)
        currentR34Source = sources.r34;
    else if(sourceId === SOURCE_TYPES.GELBOORU)
        currentR34Source = sources.gelbooru;
    else if(sourceId === SOURCE_TYPES.REALBOORU)
        currentR34Source = sources.realbooru;
    else if(sourceId === SOURCE_TYPES.DANBOORU)
        currentR34Source = sources.danbooru;
    else currentR34Source = null;
}
const postPerPage = 100; //Maximum in API
let maxPosts = 0;
let currentPage;
let currentQueryTags = "";

export function CanMoreMedia() {
    // Danbooru refuses pages past its limit however many posts match.
    const maxPages = Math.min(Math.ceil(maxPosts/postPerPage), currentR34Source?.maxPages ?? Infinity);
    return maxPages > currentPage + 1;
}

// Search status for the UI (search bar spinner, sidebar result count, empty states).
const status = { loading: false, total: null, error: null, query: null, source: null };
const statusListeners = new Set();

function setStatus(patch) {
    Object.assign(status, patch);
    statusListeners.forEach(fn => fn({ ...status }));
}

export const getSearchStatus = () => ({ ...status });

// For loaders that don't go through SearchMedia (R34 favourites).
export const setSearchStatus = (patch) => setStatus(patch);

export function subscribeSearchStatus(fn) {
    statusListeners.add(fn);
    return () => statusListeners.delete(fn);
}

let controller = new AbortController();

const VIDEO_RE = /\.(mp4|webm|mkv|mov)(\?|$)/i;
const RATING = { s: 'safe', q: 'questionable', e: 'explicit', g: 'general', general: 'general', safe: 'safe', questionable: 'questionable', explicit: 'explicit', sensitive: 'sensitive' };

// One API post → ThumbFile data. The grid gets the light preview/sample image; the
// viewer (and favourites / imports) the original file.
function postToData(post, source = currentR34Source) {
    const getPostAttr = (p, attr) => (source.remoteType === SOURCE_TYPES.GELBOORU
        ? p.querySelector(attr)?.textContent
        : p.getAttribute(attr));
    const fileUrl = getPostAttr(post, 'file_url') || '';
    const isVideo = VIDEO_RE.test(fileUrl);
    const preview = getPostAttr(post, 'preview_url');
    const sample  = getPostAttr(post, 'sample_url');
    const created = Date.parse(getPostAttr(post, 'created_at') || '');
    return {
        previewUrl: preview,
        // sample for stills (sharp at tile size), the small preview for videos
        thumbUrl:   (isVideo ? preview : (sample || preview)) || fileUrl,
        contentUrl: fileUrl,
        type:       isVideo ? FILE_TYPES.VIDEO : FILE_TYPES.IMAGE,
        remoteType: source.remoteType,
        tags:       (getPostAttr(post, 'tags') || '').split(' ').filter(Boolean),
        sourceUrl:  source.sourceUrl + getPostAttr(post, 'id'),
        remoteId:   getPostAttr(post, 'id'),
        width:      Number(getPostAttr(post, 'width')) || 0,
        height:     Number(getPostAttr(post, 'height')) || 0,
        score:      Number(getPostAttr(post, 'score')) || 0,
        remoteRating: RATING[String(getPostAttr(post, 'rating') || '').toLowerCase()] || null,
        time:       isFinite(created) ? Math.floor(created / 1000) : null,
    };
}

// Danbooru post JSON → ThumbFile data. Its tag categories come with the post, so
// they are remembered for the tag panel without extra lookups.
const DAN_RATING = { g: 'general', s: 'sensitive', q: 'questionable', e: 'explicit' };
const DAN_VIDEO = new Set(['mp4', 'webm', 'zip']);   // zip = ugoira, played as its webm sample

function danbooruToData(p, source = sources.danbooru) {
    const isVideo = DAN_VIDEO.has(p.file_ext);
    const fileUrl = p.file_ext === 'zip' ? p.large_file_url : p.file_url;
    const variants = p.media_asset?.variants || [];
    const tile = variants.find(v => v.type === '720x720') || variants.find(v => v.type === '360x360');
    const created = Date.parse(p.created_at || '');
    return {
        previewUrl: p.preview_file_url,
        thumbUrl:   tile?.url || p.large_file_url || p.preview_file_url || fileUrl,
        contentUrl: fileUrl,
        type:       isVideo ? FILE_TYPES.VIDEO : FILE_TYPES.IMAGE,
        remoteType: source.remoteType,
        tags:       (p.tag_string || '').split(' ').filter(Boolean),
        sourceUrl:  source.sourceUrl + p.id,
        remoteId:   String(p.id),
        width:      p.image_width || 0,
        height:     p.image_height || 0,
        score:      p.score ?? 0,
        remoteRating: DAN_RATING[p.rating] || null,
        time:       isFinite(created) ? Math.floor(created / 1000) : null,
    };
}

function rememberDanbooruKinds(posts) {
    const tags = [];
    const kinds = { artist: 'tag_string_artist', character: 'tag_string_character', copyright: 'tag_string_copyright', general: 'tag_string_general', meta: 'tag_string_meta' };
    posts.forEach(p => Object.entries(kinds).forEach(([type, field]) =>
        (p[field] || '').split(' ').filter(Boolean).forEach(name => tags.push({ name, type }))));
    if (tags.length) rememberKinds(tags);
}

// One page of results from any source: { total, items: ThumbFile[] }.
async function fetchPage(source, tags, page, signal, limit = postPerPage) {
    if (source.api === 'danbooru') {
        const { total, posts } = await fetchDanbooru(source, tags, page, signal, limit);
        rememberDanbooruKinds(posts);
        return { total, items: posts.filter(p => p.file_url || p.large_file_url).map(p => GetThumbByData(danbooruToData(p, source))).filter(Boolean) };
    }
    const xml = await fetchPosts(source, tags, page, signal, limit);
    const root = xml.querySelector('posts');
    const total = root ? parseInt(root.getAttribute('count')) || 0 : 0;
    const items = Array.from(xml.querySelectorAll('post'))
        .map(post => GetThumbByData(postToData(post, source)))
        .filter(Boolean);
    return { total, items };
}

function showPage({ total, items }, isNewSearch) {
    if (total != null) maxPosts = total;
    if (isNewSearch) setGallery(items);
    else addToGallery(items);
    return items;
}

export async function SearchMedia(tagsString) {
    controller.abort();
    controller = new AbortController();

    currentQueryTags = tagsString;
    currentPage = 0;
    setStatus({ loading: true, error: null, query: tagsString, source: currentR34Source?.remoteType });

    try {
        const posts = showPage(await fetchPage(currentR34Source, currentQueryTags, currentPage, controller.signal), true);
        setStatus({ loading: false, total: maxPosts });
        return posts;
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error("Search error:", err);
        setStatus({ loading: false, error: err.message || 'Ошибка поиска' });
    }
}

export async function LoadMoreMedia() {
    if (!CanMoreMedia()) return;

    currentPage += 1;
    setStatus({ loading: true });

    try {
        const res = await fetchPage(currentR34Source, currentQueryTags, currentPage, controller.signal);
        showPage({ ...res, total: currentR34Source.api === 'danbooru' ? null : res.total }, false);
        setStatus({ loading: false });
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error("Load more error:", err);
        setStatus({ loading: false, error: err.message || 'Ошибка загрузки' });
    }
}

// First `limit` posts of a query + its total count, without touching the gallery
// (the preview strips on the saved-searches page).
export async function fetchPreview(tagsString, limit = 12, signal) {
    return fetchPage(currentR34Source, tagsString, 0, signal, limit);
}

// Danbooru speaks order:/rating: words of its own and counts results separately.
// Anonymous searches are capped at 2 tags; login + API key raise that.
export function toDanbooruQuery(tags) {
    return (Array.isArray(tags) ? tags : tags.trim().split(/\s+/))
        .filter(Boolean)
        .map(t => t === 'sort:score:desc' ? 'order:score'
            : t === 'sort:random' ? 'order:random'
            : t === 'rating:safe' ? 'rating:general'
            : t)
        .join(' ');
}

async function danbooruJson(url, signal) {
    const response = await fetch(url, { signal });
    let body = null;
    try { body = await response.json(); } catch { /* not JSON */ }
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            throw new Error(`Доступ запрещён (HTTP ${response.status}) — проверь логин и API-ключ Danbooru в настройках`);
        }
        const msg = body?.message || `HTTP ${response.status}`;
        throw new Error(/more than 2 tags/i.test(msg)
            ? 'Danbooru без аккаунта ищет максимум по 2 тегам — убери лишние или добавь логин и API-ключ в настройках'
            : msg);
    }
    return body;
}

async function fetchDanbooru(source, tags, page, signal, limit) {
    const q = encodeURIComponent(toDanbooruQuery(tags));
    const auth = PrivateData.DanbooruLogin && PrivateData.DanbooruApiKey
        ? `&login=${encodeURIComponent(PrivateData.DanbooruLogin)}&api_key=${encodeURIComponent(PrivateData.DanbooruApiKey)}`
        : '';
    const postsUrl = `${source.mainUrl}?limit=${limit}&page=${page + 1}&tags=${q}${auth}`;
    const countUrl = `https://danbooru.donmai.us/counts/posts.json?tags=${q}${auth}`;
    const [posts, counts] = await Promise.all([
        danbooruJson(postsUrl, signal),
        page === 0 ? danbooruJson(countUrl, signal).catch(() => null) : null,
    ]);
    const total = counts ? counts.counts?.posts ?? posts.length : null;
    return { total, posts: Array.isArray(posts) ? posts : [] };
}

export async function fetchPosts(source, tags, page, signal, limit = postPerPage) {
    const tagsParam = Array.isArray(tags)
        ? tags.join('+')
        : tags.trim().replace(/\s+/g, '+');

    const { mainUrl } = source;
    // Each booru has its own API credentials (rule34 ones are the fallback).
    const isGel = source.remoteType === SOURCE_TYPES.GELBOORU;
    const apiKey = (isGel && PrivateData.GelbooruApiKey) || PrivateData.R34ApiKey;
    const userId = (isGel && PrivateData.GelbooruUserId) || PrivateData.R34UserId;

    const url = `${mainUrl}&limit=${limit}&pid=${page}&tags=${tagsParam}&api_key=${apiKey}&user_id=${userId}`;
    const response = await fetch(url, { signal });
    if (response.status === 401 || response.status === 403) {
        throw new Error(`Доступ запрещён (HTTP ${response.status}) — проверь API-ключ ${source.name} в настройках`);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return new window.DOMParser().parseFromString(text, "text/xml");
}

export async function fetchAutocomplete(source, lastWord) {
    const suffix = source.remoteType === SOURCE_TYPES.R34 ? "" : "%";
    const url = `${source.tagUrl}${lastWord}${suffix}`;
    const response = await fetch(url);
    return await response.json();
}
