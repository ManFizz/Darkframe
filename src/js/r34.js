import { BuildThumbBySrc, ClearGallery } from "./thumb.js";
import { AddFavTag } from './FavController.js';
import { MaybeForceOpenModal } from './modal.js';

const block_tags = ['scat', 'fart', 'yaoi', 'male_focus', 'zoophilia','fury','furry'];
const sort_tag = ['sort:updated'];
/*
id
score
rating
user
height
width
parent
source
updated
 */
const postPerPage = 50;

let currentPage;
let tagInput;
let tagUl;
let tagSelect;

$( document ).ready(function() {
    let form = document.querySelector("#tags-form");
    tagUl = form.querySelector('#ul-tags');

    form.addEventListener("submit", async (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        let input = form.querySelector("#tags-input");
        let inputRate = form.querySelector("#rate-input").value;
        ClearGallery();
        await WorkTags(input.value + " score:>=" + inputRate);
    });

    let form2 = document.querySelector('#tag-fav-add');
    form2.addEventListener("submit", async (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        let input = form2.querySelector("input");
        AddFavTag(input.value);
        input.value = "";
    });

    tagInput = document.querySelector('#tags-form input');
    tagInput.addEventListener('input', () => {
        FindTag(tagInput.value);
        UpdateFormTags(tagInput.value.split(' '));

        /*let elem = document.createElement("button");
        elem.type = "button";
        elem.classList.add("btn");
        elem.classList*/
    });

    tagSelect = document.querySelector("#tags-select");
});

function BuildUrlByTags(stringTags, page=1)
{
    if(page === null || page === undefined)
        page = 0;

    let url = 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&pid=' + (page-1) + '&limit=' + postPerPage +'&tags=';
    let tags = stringTags.split(' ');
    tags.forEach(tag => {
        url += "+" + tag;
    });

    if(!stringTags.includes("sort:"))
        url += "+" + sort_tag;

    block_tags.forEach(tag => {
        if(tags.includes(tag))
            return;

        url += "+-" + tag;
    });
    url = url.replace("&tags=+", "&tags=");
    return url;
}

let lastTags;
async function WorkTags(tags, pageNum=1) {
    currentPage = pageNum;
    lastTags = tags;

    const inputPageUrl = BuildUrlByTags(tags, pageNum);
    tags = tags.split(' ');
    UpdateFormTags(tags);
    await AddToGalleryByURL(inputPageUrl, pageNum);
}

export async function WorkLastTags() {
    return await WorkTags(lastTags, currentPage + 1);
}

function isEmptyOrSpaces(str){
    return str === null || str.match(/^ *$/) !== null;
}

function UpdateFormTags(tags=null) {
    if(tags == null)
        tags = document.querySelector("#tags-form input").value.split(' ');
    let form = document.querySelector("#tags-select");
    while (form.childNodes.length > 0)
        form.childNodes[0].remove();

    tags.forEach(tag => {
        if(isEmptyOrSpaces(tag) || tag.includes('score:'))
            return;

        tag = tag.replace(/ {2}/g,' ').trim();
        let div = document.createElement('div');
        div.classList.add('btn-group');
        let btn = document.createElement('button');
        btn.textContent = tag;
        btn.classList.add('btn');
        if(tag[0] === '-') {
            btn.classList.add('btn-danger');
        } else {
            btn.classList.add('btn-success');
        }
        btn.onclick = () => {
            ToggleTag(tag);
        };
        div.appendChild(btn);

        btn = document.createElement('button');
        btn.classList.add('btn');
        btn.classList.add('btn-light');
        btn.classList.add('text-black');
        btn.type = "button";
        btn.innerHTML = '<i class="bi bi-x"></i>'
        btn.onclick = () => {
            let input = document.querySelector("#tags-form input");
            input.value = input.value.replace(tag, '');
            UpdateFormTags(input.value.split(' '));
        };
        div.appendChild(btn);
        form.appendChild(div);
    });
}

export function ToggleTag(tag) {
    let input = document.querySelector("#tags-form > div > input")
    let tags = input.value;
    if(tag[0] === '-') {
        tags = tags.replace(tag, tag.substring(1));
    } else if(tags.includes('-' + tag)) {
        tags = tags.replace('-' + tag, tag);
    } else if(tags.includes(tag)) {
        tags = tags.replace(tag, '-' + tag);
    } else tags += ' ' + tag;
    input.value = tags;
    UpdateFormTags(tags.split(' '));
}

let lastRequestLoadByURL = null;
async function AddToGalleryByURL(url, pageNum)
{
    console.log(url);
    if(lastRequestLoadByURL !== null)
        lastRequestLoadByURL.abort();

    const x = new XMLHttpRequest();
    x.open("GET", url, true);
    x.onreadystatechange = function () {
        if (x.readyState !== 4 || x.status !== 200)
            return;

        const max = parseInt(x.responseXML.querySelector('posts').getAttribute('count'));
        const offset = parseInt(x.responseXML.querySelector('posts').getAttribute('offset'));
        const posts = x.responseXML.querySelectorAll("post");
        if(offset === 0)
        {
            if(posts.length !== max)
            {
                let pagination = $('#pagination');
                if(pagination.classList !== undefined)
                    pagination.classList.remove('hidden');

                pagination.twbsPagination({
                    startPag: pageNum,
                    totalPages: (max + postPerPage-1)/postPerPage,
                    visiblePages: 7,
                    initiateStartPageClick: false,
                    onPageClick: function (event, page) {
                        ClearGallery();
                        WorkTags(lastTags, page);
                    }
                });

            }
            else
            {
                let pag = $('#pagination');
                if(pag !== undefined && pag.classList !== undefined)
                    pag.classList.add('hidden');
            }
        }

        posts.forEach(post => {
            BuildThumbBySrc(post.getAttribute('file_url'), null, post.getAttribute('tags'));
        });
        lastRequestLoadByURL = null;
        MaybeForceOpenModal();

    };
    x.send(null);
    lastRequestLoadByURL = x;
}

let lastRequestTagFind = null;
function FindTag(tag)
{
    if(lastRequestTagFind !== null)
        lastRequestTagFind.abort();

    let match = tag.match(/[^ -][^ ]*$/);
    if(match == null)
    {
        tagUl.classList.remove('show');
        return;
    }
    tag = match[0]; //Get last word

    let x = new XMLHttpRequest();
    x.open("GET", "https://api.rule34.xxx/autocomplete.php?q=" + tag, true);
    x.onload = function() {
        let list = JSON.parse(x.responseText);

        tagUl.innerHTML = ''; //Clear ul
        list.forEach( elem => {
            let li = document.createElement('li');
            li.classList.add('dropdown-item');
            let a = document.createElement('a');
            a.classList.add('dropdown-item');
            a.textContent = elem.label;
            li.appendChild(a);
            a.onclick = () => {
                InsertTag(elem.value);
            };
            tagUl.appendChild(li);
        });
        tagUl.classList.add('show');
        lastRequestTagFind = null;
    };
    x.send();
    lastRequestTagFind = x;
}

function InsertTag(tag)
{
    let value = tagInput.value;
    tagInput.value = value.replace(value.match(/[^ -][^ ]*$/)[0], '') + tag;
    tagUl.classList.remove('show');
    UpdateFormTags();
}