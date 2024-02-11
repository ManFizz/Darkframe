import { openModal } from './modal.js';
import { GetFiles } from './backend.js';
import {GetMediaFile, ImageFile, IsAnimated} from "./Display.js";
import {addFav, isFav, removeFav} from "./FavController";

let gallery = document.querySelector("#gallery");

let current_remote_type = 1;

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
    arr.forEach(src => {
        if(src.includes('.nomedia'))
            return;

        if(!src.includes('.'))
        {
            BuildThumbFolder(path, src);
            return;
        }
        BuildThumbBySrc(path + "\\" + src, 1);
    });
    BuildThumbReturn(path);
}