import {GetMediaFile} from "./Display.js";
import {getGallery, updateGallery} from "./AppInitializer";

let current_remote_type = 1;

export function ClearGallery()
{
    updateGallery([]);
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

    let displayList = getGallery();
    if(!displayList)
        displayList = [];
    displayList.push(newDisplayFile);
    updateGallery(displayList);
}