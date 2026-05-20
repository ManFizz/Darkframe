import {GetThumbByData} from "@controllers/GalleryController.js";
import {addToGallery, setGallery} from "@controllers/AppInitializerController";
import PrivateData from "@data/private";
import {SOURCE_TYPES} from "@/Constants";

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
        case SOURCE_TYPES.P365:
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

let controller = new AbortController();

async function processResponse(responseXML, isNewSearch) {
    const postsRoot = responseXML.querySelector("posts");
    if (postsRoot) {
        maxPosts = parseInt(postsRoot.getAttribute("count")) || 0;
    }

    const posts = Array.from(responseXML.querySelectorAll("post"));
    const array = posts.map(post => GetThumbByData({
        previewUrl: getPostAttr(post, 'preview_url'),
        thumbUrl: getPostAttr(post, 'file_url'),
        remoteType: currentR34Source.remoteType,
        tags: getPostAttr(post, 'tags').split(' ').filter(Boolean),
        sourceUrl: currentR34Source.sourceUrl + getPostAttr(post, 'id'),
        remoteId: getPostAttr(post, 'id'),
    })).filter(item => item !== null);

    if (isNewSearch) setGallery(array);
    else addToGallery(array);

    if (currentR34Source.remoteType !== SOURCE_TYPES.R34) {
        ensureTags(array);
    }
}

export async function SearchMedia(tagsString) {
    controller.abort();
    controller = new AbortController();

    currentQueryTags = tagsString;
    currentPage = 0;

    try {
        const xml = await fetchPosts(currentR34Source, currentQueryTags, currentPage);
        await processResponse(xml, true);
    } catch (err) {
        if (err.name !== 'AbortError') console.error("Search error:", err);
    }
}

export async function LoadMoreMedia() {
    if (!CanMoreMedia()) return;

    currentPage += 1;

    try {
        const xml = await fetchPosts(currentR34Source, currentQueryTags, currentPage);
        await processResponse(xml, false);
    } catch (err) {
        console.error("Load more error:", err);
    }
}

function getPostAttr(post, attr) {
    if (currentR34Source.remoteType === SOURCE_TYPES.GELBOORU)
        return post.querySelector(attr)?.textContent;
    return post.getAttribute(attr);
}

export async function fetchPosts(source, tags, page) {
    const tagsParam = Array.isArray(tags)
        ? tags.join('+')
        : tags.trim().replace(/\s+/g, '+');

    const { mainUrl } = source;
    const { R34ApiKey, R34UserId } = PrivateData;

    const url = `${mainUrl}&limit=${postPerPage}&pid=${page}&tags=${tagsParam}&api_key=${R34ApiKey}&user_id=${R34UserId}`;
    const response = await fetch(url);
    const text = await response.text();
    return new window.DOMParser().parseFromString(text, "text/xml");
}

export async function fetchAutocomplete(source, lastWord) {
    const suffix = source.remoteType === SOURCE_TYPES.R34 ? "" : "%";
    const url = `${source.tagUrl}${lastWord}${suffix}`;
    const response = await fetch(url);
    return await response.json();
}
