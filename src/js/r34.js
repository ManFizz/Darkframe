import {BuildThumbByData, ClearGallery} from "./thumb.js";
import PrivateData from "../../data/private";
import {SOURCE_TYPES} from "./Display";

const postPerPage = 100;

const sources = {
    r34: {
        name: "Rule 34",
        mainUrl: "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index",
        tagUrl: "https://api.rule34.xxx/autocomplete.php?q=",
        sourceUrl: "https://rule34.xxx/index.php?page=post&s=view&id=",
        remoteType: SOURCE_TYPES.R34,
    },
    gelbooru: {
        name: "Gelbooru",
        mainUrl: "https://gelbooru.com/index.php?page=dapi&s=post&q=index" + PrivateData.api_gelbooru,
        tagUrl: "https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1&limit=8&orderby=count" +
            PrivateData.api_gelbooru + "&name_pattern=",
        tagsUrl: "https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1" +
            PrivateData.api_gelbooru + "&names=",
        sourceUrl: "https://gelbooru.com/index.php?page=dapi&s=post&q=index" +
            PrivateData.api_gelbooru + "&id=",
        remoteType: SOURCE_TYPES.GELBOORU,
    }
};

export let currentR34Source = sources.r34;

export function updateR34Source(sourceId) {
    if(sourceId === SOURCE_TYPES.R34)
        currentR34Source = sources.r34;
    else if(sourceId === SOURCE_TYPES.GELBOORU)
        currentR34Source = sources.gelbooru;
    else currentR34Source = null;
}

export async function addByIdArray() {
    if(currentR34Source.remoteType === SOURCE_TYPES.GELBOORU || currentR34Source.remoteType === SOURCE_TYPES.R34) {
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

export function AddMedia(stringTags, pageNum= 1) {
    if(stringTags !== null) {
        currentPage = pageNum;
        currentTags = stringTags;
    } else {
        const maxPages = Math.ceil(maxPosts/postPerPage);
        if(maxPages <= currentPage)
            return;

        currentPage += 1;
    }

    const tags = currentTags.split(' ');
    UpdateFormTags(tags);

    const inputPageUrl = `${currentR34Source.mainUrl}&limit=${postPerPage}&pid=${currentPage - 1}&tags=${tags.join('+')}`;
    AddToGalleryByURL(inputPageUrl, currentPage).then();
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
async function AddToGalleryByURL(url, pageNum) {
    if (lastRequestLoadByURL !== null)
        lastRequestLoadByURL.abort();

    lastRequestLoadByURL = sendRequest(url, pageNum);
}

function sendRequest(url, pageNum) {
    const x = new XMLHttpRequest();
    x.open("GET", url, true);
    x.onreadystatechange = function () {
        if (x.readyState !== 4 || x.status !== 200)
            return;

        handleResponse(x.responseXML, pageNum);
    };
    x.send(null);
    return x;
}

function handleResponse(responseXML, pageNum) {
    maxPosts = parseInt(responseXML.querySelector('posts').getAttribute('count'));
    const posts = responseXML.querySelectorAll("post");

    const sourceUrl = currentR34Source.sourceUrl;
    const bR34 = currentR34Source.remoteType === SOURCE_TYPES.R34;
    posts.forEach(post => {
        BuildThumbByData({
            thumbUrl: bR34 ? post.getAttribute('file_url') : post.querySelector('file_url').textContent,
            remoteType: currentR34Source.remoteType,
            tags: bR34 ? post.getAttribute('tags') : post.querySelector('tags').textContent,
            sourceUrl: sourceUrl + (bR34 ? post.getAttribute('id') : post.querySelector('id').textContent),
        });
    });

    lastRequestLoadByURL = null;
}

let lastRequestTagFind = null;

export function FindTag(tag) {
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
    const url = currentR34Source.tagUrl + lastWord + (currentR34Source.name === "Gelbooru" ? "%" : "");
    x.open("GET", url, true);
    x.onload = function() {
        handleTagResponse(x.responseText, tagUl);
        lastRequestTagFind = null;
    };
    x.send();
    lastRequestTagFind = x;
}

function handleTagResponse(responseText, tagUl) {
    let list = JSON.parse(responseText);
    if(currentR34Source.name === "Gelbooru")
        list = list.tag;

    tagUl.innerHTML = ''; // Clear tags list

    list.forEach(elem => {
        const li = document.createElement('li');
        li.classList.add('dropdown-item');

        const a = document.createElement('a');
        a.classList.add('dropdown-item');
        a.textContent = (currentR34Source.name === "Rule 34") ? elem.label : `${elem.name} (${elem.count})`;
        a.onclick = () => {
            const tagValue = (currentR34Source.name === "Rule 34") ? elem.value : elem.name;
            InsertTag(tagValue);
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
