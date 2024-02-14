import { BuildThumbBySrc, ClearGallery } from "./thumb.js";
import { MaybeForceOpenModal } from './modal.js';
import PrivateData from "../../private";

const sources = {
    r34: {
        name: "Rule 34",
        mainUrl: "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index",
        tagUrl: "https://api.rule34.xxx/autocomplete.php?q=",
        sourceUrl: "https://rule34.xxx/index.php?page=post&s=view&id=",
        remoteType: 2,
    },
    gelbooru: {
        name: "Gelbooru",
        mainUrl: "https://gelbooru.com/index.php?page=dapi&s=post&q=index" + PrivateData.api_gelbooru,
        tagUrl: "https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1&limit=8&orderby=count" +
            PrivateData.api_gelbooru + "&name_pattern=",
        sourceUrl: "https://gelbooru.com/index.php?page=dapi&s=post&q=index" +
            PrivateData.api_gelbooru + "&id=",
        remoteType: 4,
    }
};

const postPerPage = 50;


let currentSource = sources.r34;
export function GetCurrentSource() {
    return currentSource;
}

export function SetSource(name) {
    if(name === sources.r34.name)
        currentSource = sources.r34;
    else if(name === sources.gelbooru.name)
        currentSource = sources.gelbooru;
    else throw new Error("undefined source: " + name);
}

let currentPage;
let currentTags;
export function AddMedia(stringTags, pageNum= 1) {
    if(stringTags !== null) {
        currentPage = pageNum;
        currentTags = stringTags;
    } else {
        currentPage += 1;
    }

    const tags = currentTags.split(' ');
    UpdateFormTags(tags);

    const inputPageUrl = `${currentSource.mainUrl}&limit=${postPerPage}&pid=${pageNum - 1}&tags=${tags.join('+')}`;
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
    const max = parseInt(responseXML.querySelector('posts').getAttribute('count'));
    const offset = parseInt(responseXML.querySelector('posts').getAttribute('offset'));
    const posts = responseXML.querySelectorAll("post");

    if (offset === 0) {
        handlePagination(posts.length, max, pageNum);
    }

    const sourceUrl = currentSource.sourceUrl;
    posts.forEach(post => {
        const file_url = currentSource.name === "Rule 34" ? post.getAttribute('file_url') : post.querySelector('file_url').textContent;
        const tags = currentSource.name === "Rule 34" ? post.getAttribute('tags') : post.querySelector('tags').textContent;
        const url = sourceUrl + (currentSource.name === "Rule 34" ? post.getAttribute('id') : post.querySelector('id').textContent);
        BuildThumbBySrc(file_url, currentSource.remoteType, null, tags, url);
    });

    lastRequestLoadByURL = null;
    MaybeForceOpenModal();
}

function handlePagination(postsLength, max, pageNum) {
    if (max !== postsLength) {
        const pagination = document.getElementById('pagination');
        if (pagination && pagination.classList) {
            pagination.classList.remove('hidden');
            $(pagination).twbsPagination({
                startPag: pageNum,
                totalPages: (max + postPerPage - 1) / postPerPage,
                visiblePages: 7,
                initiateStartPageClick: false,
                onPageClick: function (event, page) {
                    ClearGallery();
                    AddMedia(currentTags, page);
                }
            });
        }
    } else {
        const pagination = document.getElementById('pagination');
        if (pagination && pagination.classList) {
            pagination.classList.add('hidden');
        }
    }
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
    const url = currentSource.tagUrl + lastWord + (currentSource.name === "Gelbooru" ? "%" : "");
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
    if(currentSource.name === "Gelbooru")
        list = list.tag;

    tagUl.innerHTML = ''; // Clear tags list

    list.forEach(elem => {
        const li = document.createElement('li');
        li.classList.add('dropdown-item');

        const a = document.createElement('a');
        a.classList.add('dropdown-item');
        a.textContent = (currentSource.name === "Rule 34") ? elem.label : `${elem.name} (${elem.count})`;
        a.onclick = () => {
            const tagValue = (currentSource.name === "Rule 34") ? elem.value : elem.name;
            InsertTag(tagValue);
        };

        li.appendChild(a);
        tagUl.appendChild(li);
    });

    tagUl.classList.add('show');
}

function InsertTag(tag) {
    const tagInput = document.querySelector('#tags-form input');
    const value = tagInput.value;
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
