import { openModal } from './modal.js';
import { GetFiles } from './backend.js';
import {GetMediaFile, ImageFile, IsAnimated} from "./Display.js";
import {addFav, removeFav} from "./FavController";

let gallery;

let current_remote_type = 1;

export function InitThumb(){
    gallery = document.querySelector("#gallery");
}

export function ClearGallery()
{
    while (gallery.childNodes.length > 0)
        gallery.childNodes[0].remove();

    imageList = [];
}


export function GetThumb() {

    let el = document.createElement('div');
    el.classList.add('card');
    el.classList.add('thumb');
    el.classList.add('bg-dark');
    return el;
}

let imageList = [];

export function getImageList() {
    return imageList;
}

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
                if(anim === false)
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

