import { GetThumbByData } from "./GalleryController.js";
import PrivateData from "../../data/private";
import { SOURCE_TYPES } from "./Display";
import { NotifyCustomPaginationR34 } from "./React/CustomPagination";
import { addToGallery, setGallery } from "./AppInitializer";
import { GetTags, UpdateTagsData } from "./TagsController";

const postPerPage = 100; //MAX in API

const sources = {
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

function isR34Family(type) {
    return type === SOURCE_TYPES.GELBOORU || type === SOURCE_TYPES.R34 || type === SOURCE_TYPES.REALBOORU;
}

export async function addByIdArray() {
    if(isR34Family(currentR34Source.remoteType)) {
        const idArray = PrivateData.idArray;
        for (let i = 0; i < idArray.length; i++) {
            const id = idArray[i];
            setTimeout(() => AddMedia(`id:=${id}`), i * 250);
        }
    }
}

let maxPosts = 0;
let currentPage;
let currentTags;

export function CanMoreMedia() {
    const maxPages = Math.ceil(maxPosts/postPerPage);
    return maxPages > currentPage;
}

let stateOfClear = true;

export function AddMedia(stringTags, pageNum= 1) {
    if(stringTags !== null) {
        currentPage = pageNum;
        currentTags = stringTags;
        stateOfClear = true;
    } else {
        if(!CanMoreMedia())
            return;
        stateOfClear = false;
        currentPage += 1;
    }

    const tags = currentTags.split(' ');
    UpdateFormTags(tags);

    const inputPageUrl = `${currentR34Source.mainUrl}&limit=${postPerPage}&pid=${currentPage - 1}&tags=${tags.join('+')}`;
    AddToGalleryByURL(inputPageUrl).then();
}

export function UpdateFormTags(tags = null) {
    tags = tags || document.querySelector("#tags-form input").value.split(' ');

    const form = document.querySelector("#tags-select");
    form.innerHTML = '';

    tags.forEach(tag => {
        if (!tag.trim() || tag.includes('score:')) return;

        tag = tag.replace(/ {2}/g, ' ').trim();
        const div = document.createElement('div');
        div.classList.add('btn-group');

        const btn = document.createElement('button');
        btn.textContent = tag;
        btn.classList.add('btn', tag[0] === '-' ? 'btn-danger' : 'btn-success');
        btn.onclick = () => ToggleTag(tag);
        div.appendChild(btn);

        const removeBtn = document.createElement('button');
        removeBtn.classList.add('btn', 'btn-light', 'text-black');
        removeBtn.type = "button";
        removeBtn.innerHTML = '<i class="bi bi-x"></i>';
        removeBtn.onclick = () => {
            const input = document.querySelector("#tags-form input");
            input.value = input.value.replace(tag, '');
            UpdateFormTags(input.value.split(' '));
        };
        div.appendChild(removeBtn);

        form.appendChild(div);
    });
}

export function ToggleTag(tag) {
    const input = document.querySelector("#tags-form > div > input");
    let tags = input.value.split(' ');

    if (tag[0] === '-') {
        const index = tags.indexOf(tag.substring(1));
        if (index !== -1) {
            tags.splice(index, 1);
        }
    } else {
        const negatedTag = '-' + tag;
        const negatedIndex = tags.indexOf(negatedTag);
        if (negatedIndex !== -1) {
            tags.splice(negatedIndex, 1);
        } else if (!tags.includes(tag)) {
            tags.push(tag);
        }
    }

    input.value = tags.join(' ');
    UpdateFormTags(tags);
}

let lastRequestLoadByURL = null;
async function AddToGalleryByURL(url) {
    if (lastRequestLoadByURL !== null)
        lastRequestLoadByURL.abort();

    lastRequestLoadByURL = sendRequest(url);
}

function sendRequest(url) {
    const x = new XMLHttpRequest();
    x.open("GET", url, true);
    x.onreadystatechange = function () {
        if (x.readyState !== 4 || x.status !== 200)
            return;

        handleResponse(x.responseXML);
    };
    x.send(null);
    return x;
}

function GetData(post, dataName) {
    switch (currentR34Source.remoteType) {
        case SOURCE_TYPES.R34: {
            return post.getAttribute(dataName);
        }
        case SOURCE_TYPES.REALBOORU: {
            return post.getAttribute(dataName);
        }
        case SOURCE_TYPES.GELBOORU: {
            return post.querySelector(dataName).textContent;
        }
    }
}

function handleResponse(responseXML) {
    maxPosts = parseInt(responseXML.querySelector('posts').getAttribute('count'));
    const posts = responseXML.querySelectorAll("post");

    const sourceUrl = currentR34Source.sourceUrl;
    let array = [];
    const bR34 = currentR34Source.remoteType === SOURCE_TYPES.R34;
    posts.forEach(post => {
        console.log(post);
        const thumbFile = GetThumbByData({
            previewUrl: GetData(post, 'preview_url'),
            thumbUrl: GetData(post,'file_url'),
            remoteType: currentR34Source.remoteType,
            tags: GetData(post,'tags'),
            sourceUrl: sourceUrl + GetData(post,'id'),
        });
        array.push(thumbFile);
    });
    console.log(array);
    if(stateOfClear)
        setGallery(array);
    else
        addToGallery(array);

    if(!bR34)
        LoadTagsData(array);

    lastRequestLoadByURL = null;
    NotifyCustomPaginationR34();
}

let lastRequestTagFind = null;

export function FindTagByPart(tag) {
    if (lastRequestTagFind !== null)
        lastRequestTagFind.abort();

    const tagUl = document.querySelector('#tags-form #ul-tags');
    const match = tag.match(/[^ -][^ ]*$/);
    if (match === null) {
        tagUl.classList.remove('show');
        return;
    }

    const lastWord = match[0];

    const x = new XMLHttpRequest();
    const url = currentR34Source.tagUrl + lastWord + (currentR34Source.remoteType === SOURCE_TYPES.R34 ? "" : "%");
    x.open("GET", url, true);
    x.onload = function() {
        handleFindTagByPartResponse(x.responseText, tagUl);
        lastRequestTagFind = null;
    };
    x.send();
    lastRequestTagFind = x;
}

function handleFindTagByPartResponse(responseText, tagUl) {
    let list = JSON.parse(responseText);
    if(currentR34Source.remoteType === SOURCE_TYPES.GELBOORU)
        list = list.tag;

    tagUl.innerHTML = ''; // Clear tags list
    if(list === undefined) {
        tagUl.classList.remove('show');
        return;
    }

    list.forEach(elem => {
        const li = document.createElement('li');
        li.classList.add('dropdown-item');

        const a = document.createElement('a');
        a.classList.add('dropdown-item');
        a.textContent = (currentR34Source.remoteType === SOURCE_TYPES.GELBOORU) ? `${elem.name} (${elem.count})` : elem.label;
        a.onclick = () => {
            const tagValue = (currentR34Source.remoteType === SOURCE_TYPES.GELBOORU) ? elem.name : elem.value;
            InsertTag(tagValue);
            tagUl.classList.remove('show');
        };

        li.appendChild(a);
        tagUl.appendChild(li);
    });

    tagUl.classList.add('show');
}

export function InsertTag(tag) {
    const tagInput = document.querySelector('#tags-form input');
    const value = tagInput.value;
    if(value.includes(tag)) //Probably some issue TODO
        return;

    const match = value.match(/[^ -][^ ]*$/);

    if (match) {
        tagInput.value = value.replace(match[0], tag);
    } else {
        tagInput.value += (value ? ' ' : '') + tag;
    }

    const tagUl = document.querySelector('#tags-form #ul-tags');
    tagUl.classList.remove('show');

    UpdateFormTags();
}

let inWorkTags = null;
let inWorkSource = null;
let lastRequestTagsUpdate = null;
export function LoadTagsData(displayFiles = null) {
    if(currentR34Source === null || currentR34Source.remoteType === SOURCE_TYPES.R34)
        return;

    if(lastRequestTagsUpdate !== null)
        lastRequestTagsUpdate.abort();

    if(displayFiles !== null)
        UpdateTagsInWork(displayFiles);

    const slicedArray = inWorkTags.slice(0, postPerPage);
    inWorkTags = inWorkTags.slice(postPerPage);

    const x = new XMLHttpRequest();
    const url = currentR34Source.tagsUrl + slicedArray.join(' ');
    x.open("GET", url, true);
    x.onload = function() {
        responseTags(JSON.parse(x.responseText).tag);
        lastRequestTagsUpdate = null;
    };
    x.send();
    lastRequestTagsUpdate = x;
}

function decode(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

function responseTags(tags) {
    tags = tags.map(tag => ({
        ...tag,
        name: decode(tag.name),
        remoteType: inWorkSource,
    }));
    UpdateTagsData(tags);

    if(inWorkTags.length > 0)
        setTimeout(() => LoadTagsData(), 1000);
}

function UpdateTagsInWork(displayFiles) {
    const existedTags = GetTags();
    const uniqueTags = {};
    displayFiles.forEach(thumb => {
        if (thumb.tags === null) //???
            return;

        thumb.tags.split(' ').forEach(tag => {
            uniqueTags[tag] = true;
        });
    });
    const splitTags = Object.keys(uniqueTags);
    inWorkTags = splitTags.filter(obj1 =>
      !existedTags.some(obj2 =>
        obj1 === obj2.name && (obj2.type !== null && obj2.type !== undefined)
      )
    );
    inWorkSource = currentR34Source.remoteType;
}