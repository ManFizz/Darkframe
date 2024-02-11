import { openModal } from './modal.js';
import { GetFiles } from './backend.js';
import {GetMediaFile, ImageFile, IsAnimated} from "./Display.js";
import {addFav, isFav, removeFav} from "./FavController";

let gallery = document.querySelector("#gallery");

let current_remote_type = 1;

document.addEventListener('DOMContentLoaded', function() {
    let btnOrderSort = document.getElementById("btn-order-sort");
    btnOrderSort.addEventListener('click', function(event) {
        event.preventDefault();

        if (typeOrder !== 'asc') {
            typeOrder = 'asc';
        } else typeOrder = 'desc';

        let icon = btnOrderSort.querySelector('.fa');
        if (icon) {
            icon.className = 'fa fa-sort-' + typeOrder;
            icon.outerHTML += "";
        }

        SortFolderDisplay();
    });

    let btnTypeSort = document.getElementById('btn-type-sort');
    btnTypeSort.innerText = typeSort;
    btnTypeSort.addEventListener('click', function(event) {
        event.preventDefault();

        if(typeSort === 'name'){
            typeSort = 'time'
        } else typeSort = 'name';

        btnTypeSort.innerText = typeSort;

        SortFolderDisplay();
    });
});
export function ClearGallery()
{
    while (gallery.childNodes.length > 0)
        gallery.childNodes[0].remove();

    imageList = [];
}


function GetThumb() {

    let el = document.createElement('div');
    el.classList.add('card');
    el.classList.add('thumb');
    el.classList.add('bg-dark');
    return el;
}

export function BuildThumbReturn(path) {
    let arr = path.split('\\');
    path = '';
    for(let i = 0; i < arr.length - 2; i++)
        path += arr[i] + '\\';
    path += arr[arr.length - 2];
    let blockElem = GetThumb();

    let img = document.createElement("img");
    img.src = 'images/return.png';
    blockElem.appendChild(img);

    blockElem.onclick = () => {
        ClearGallery();
        DisplayImagesByPath(path).then();
    };
    if(arr.length > 1) {
        let title = document.createElement('p');
        title.classList.add('title');
        title.textContent = arr[arr.length - 2];
        blockElem.appendChild(title);
    }

    gallery.insertBefore(blockElem, gallery.firstElementChild);
}


export let imageList = [];

export function BuildThumbBySrc(thumbUrl, remote_type, openModalUrl = null, tags = null,
                                sourceUrl = null, title = null, time = null)
{
    current_remote_type = remote_type;
    let newDisplayFile = GetMediaFile(thumbUrl, openModalUrl, tags, sourceUrl, title, time);
    if(newDisplayFile == null)
        return;

    if(current_remote_type > 0)
        newDisplayFile.remote_type = current_remote_type;

    imageList.push(newDisplayFile);

    let blockElem = newDisplayFile.GetThumb();
    blockElem.setAttribute("id-list", imageList.indexOf(newDisplayFile).toString());

    if(newDisplayFile instanceof ImageFile) {
        let img = blockElem.querySelector("img");
        img.onload = async  () => {
            // Проверка, что изображение успешно загружено
            if (img.complete && img.naturalWidth > 0) {
                let anim = await IsAnimated(img.src);
                if(!anim)
                    resizeImage(img);
                img.onload = null;
            }
        };
    }

    let overlay = document.createElement("div");
    overlay.classList.add("overlay");
    buildOverlay(overlay, newDisplayFile);
    blockElem.appendChild(overlay);

    blockElem.onclick = () => {
        openModal(blockElem, openModalUrl).then();
    };

    gallery.append(blockElem);
}

function buildOverlay(overlay, displayFile) {
    if(displayFile.isFav())  {
        overlay.innerHTML = "<i class=\"bi bi-ban\"></i>";
        overlay.querySelector(".bi-ban").addEventListener("click", (e) => {
            e.stopPropagation();
            removeFav(displayFile);
            buildOverlay(overlay, displayFile);
        });
    }
    else
    {
        overlay.innerHTML = "<i class=\"bi bi-heart-fill\"></i>";
        overlay.querySelector(".bi-heart-fill").addEventListener("click", (e) => {
            e.stopPropagation();
            addFav(displayFile);
            buildOverlay(overlay, displayFile);
        });
    }
}


export function BuildThumbFolder(path, name) {
    path = path + '\\' + name;

    let blockElem = GetThumb();
    let img = document.createElement("img");
    img.src = 'images/folder.png';
    blockElem.appendChild(img);

    blockElem.onclick = () => {
        ClearGallery();
        DisplayImagesByPath(path).then();
    };

    let title = document.createElement('p');
    title.classList.add('title');
    title.textContent = name;
    blockElem.appendChild(title);

    gallery.insertBefore(blockElem, gallery.firstElementChild);
}

let typeSort = 'time'; // 'name' или 'time'
let typeOrder = 'asc'; // 'asc' или 'desc'

const sortFunction = (a, b) => {
    if (typeSort === 'name') {
        return typeOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    } else if (typeSort === 'time') {
        return typeOrder === 'asc' ? a.time - b.time : b.time - a.time;
    }
};

export async function DisplayImagesByPath(path)
{
    let mainContainer = document.querySelector("#main-container");
    let responseText = await GetFiles(path);
    if(responseText == null) {
        let warn = document.createElement('div');
        warn.innerHTML = "<div class=\"alert alert-danger alert-dismissible fade show\">\n" +
            "    <button type=\"button\" class=\"btn-close\" data-bs-dismiss=\"alert\"></button>\n" +
            "    <strong>Error!</strong> Maybe this path doesn't exist\n" +
            "  </div>";
        mainContainer.insertBefore(warn, mainContainer.firstChild);
        return;
    }

    ClearGallery();
    let arr = JSON.parse(responseText);
    const sortedArr = arr.sort(sortFunction);

    sortedArr.forEach(item => {
        const { name, time } = item;
        if(name.includes('.nomedia'))
            return;

        if(!name.includes('.')) //is folder
        {
            BuildThumbFolder(path, name);
            return;
        }

        let absPath = path + "\\" + name;
        BuildThumbBySrc(absPath, 1, null, null, null, name, time);
    });
    BuildThumbReturn(path);
}

function getValue(object) {
    if(object === undefined)
        throw "wtf" + object + " | " + typeof object;

    if(typeSort === 'time')
        return object.time;

    if(typeSort === 'name')
        return object.title || object.thumbUrl;

    throw "undef typeSort: [" + typeOrder + "]";
}

function SortFolderDisplay() {
    const gallery = document.getElementById('gallery');
    const thumbs = gallery.querySelectorAll('.thumb');

    const sortedThumbs = Array.from(thumbs).sort(sortFunc);

    sortedThumbs.forEach(thumb => {
        gallery.insertBefore(thumb, gallery.firstChild);
    });
}


function sortFunc(a, b) {
    const idListA = parseInt(a.getAttribute("id-list"));
    const idListB = parseInt(b.getAttribute("id-list"));

    const validA = IsValidDisplayId(idListA);
    const validB = IsValidDisplayId(idListB);

    if (validA && validB) {
        const valueA = getValue(imageList[idListA]),
            valueB  = getValue(imageList[idListB]);

        if (typeOrder === 'name') {
            return valueA.localeCompare(valueB);
        } else {
            return valueA - valueB;
        }
    } else if (validA && !validB) {
        return -1;
    } else if (!validA && validB) {
        return 1;
    } else {
        return 0;
    }
}

function IsValidDisplayId(id) {
    if(isNaN(id))
        return false;

    let object = imageList[id];
    return object !== null && object !== undefined;
}


function resizeImage(originalImage) {
    const maxDimension = 1080;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    const naturalWidth = originalImage.naturalWidth;
    const naturalHeight = originalImage.naturalHeight;

    const maxDim = Math.max(naturalWidth, naturalHeight);

    const newWidth = naturalWidth * (maxDimension / maxDim);
    const newHeight = naturalHeight * (maxDimension / maxDim);

    canvas.width = newWidth;
    canvas.height = newHeight;

    context.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

    originalImage.src = canvas.toDataURL('image/jpeg'); // Используйте 'image/png', если нужен формат PNG;
}

