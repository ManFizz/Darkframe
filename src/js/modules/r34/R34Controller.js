import {GetThumbByData} from "@controllers/GalleryController.js";
import {addToGallery, setGallery} from "@controllers/AppInitializerController";
import PrivateData from "@data/private";
import {FILE_TYPES, SOURCE_TYPES} from "@/Constants";

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
    }
};

export function GetSourceDataById(sourceId) {
    switch(sourceId) {
        case SOURCE_TYPES.R34:
            return sources.r34;
        case SOURCE_TYPES.GELBOORU:
            return sources.gelbooru;
        case SOURCE_TYPES.REALBOORU:
            return sources.realbooru;
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
    else currentR34Source = null;
}
const postPerPage = 100; //Maximum in API
let maxPosts = 0;
let currentPage;
let currentQueryTags = "";

export function CanMoreMedia() {
    const maxPages = Math.ceil(maxPosts/postPerPage);
    return maxPages > currentPage;
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
function postToData(post) {
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
        remoteType: currentR34Source.remoteType,
        tags:       (getPostAttr(post, 'tags') || '').split(' ').filter(Boolean),
        sourceUrl:  currentR34Source.sourceUrl + getPostAttr(post, 'id'),
        remoteId:   getPostAttr(post, 'id'),
        width:      Number(getPostAttr(post, 'width')) || 0,
        height:     Number(getPostAttr(post, 'height')) || 0,
        score:      Number(getPostAttr(post, 'score')) || 0,
        remoteRating: RATING[String(getPostAttr(post, 'rating') || '').toLowerCase()] || null,
        time:       isFinite(created) ? Math.floor(created / 1000) : null,
    };
}

async function processResponse(responseXML, isNewSearch) {
    const postsRoot = responseXML.querySelector("posts");
    if (postsRoot) {
        maxPosts = parseInt(postsRoot.getAttribute("count")) || 0;
    }

    const posts = Array.from(responseXML.querySelectorAll("post"));
    const array = posts.map(post => GetThumbByData(postToData(post))).filter(item => item !== null);

    if (isNewSearch) setGallery(array);
    else addToGallery(array);
    return array.length;
}

export async function SearchMedia(tagsString) {
    controller.abort();
    controller = new AbortController();

    currentQueryTags = tagsString;
    currentPage = 0;
    setStatus({ loading: true, error: null, query: tagsString, source: currentR34Source?.remoteType });

    try {
        const xml = await fetchPosts(currentR34Source, currentQueryTags, currentPage, controller.signal);
        await processResponse(xml, true);
        setStatus({ loading: false, total: maxPosts });
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
        const xml = await fetchPosts(currentR34Source, currentQueryTags, currentPage, controller.signal);
        await processResponse(xml, false);
        setStatus({ loading: false });
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error("Load more error:", err);
        setStatus({ loading: false, error: err.message || 'Ошибка загрузки' });
    }
}

function getPostAttr(post, attr) {
    if (currentR34Source.remoteType === SOURCE_TYPES.GELBOORU)
        return post.querySelector(attr)?.textContent;
    return post.getAttribute(attr);
}

export async function fetchPosts(source, tags, page, signal) {
    const tagsParam = Array.isArray(tags)
        ? tags.join('+')
        : tags.trim().replace(/\s+/g, '+');

    const { mainUrl } = source;
    // Each booru has its own API credentials (rule34 ones are the fallback).
    const isGel = source.remoteType === SOURCE_TYPES.GELBOORU;
    const apiKey = (isGel && PrivateData.GelbooruApiKey) || PrivateData.R34ApiKey;
    const userId = (isGel && PrivateData.GelbooruUserId) || PrivateData.R34UserId;

    const url = `${mainUrl}&limit=${postPerPage}&pid=${page}&tags=${tagsParam}&api_key=${apiKey}&user_id=${userId}`;
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
