import { openModal } from './modal.js';
import {GetMediaFile, ImageFile} from "./Display.js";

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
    }
    blockElem.onclick = () => {
        openModal(blockElem, openModalUrl).then();
    };

    gallery.append(blockElem);
}

