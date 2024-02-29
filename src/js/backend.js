// noinspection JSIgnoredPromiseFromCall

import {OnUpdateFavoritesTags, OnUpdateFavorites} from "./FavController.js";
import {setFavTagsArray} from "./AppInitializer";
let { ipcRenderer } = require("electron");

ipcRenderer.invoke("getFavorites");
ipcRenderer.on('getFavorites', (event, arg) => {
    OnUpdateFavorites(arg);
});


export async function GetFavTags() {
    return await ipcRenderer.invoke("getFavTags");
}

ipcRenderer.on('getFavTags', (tags) => {
    setFavTagsArray(tags);
});

export async function GetFiles(path) {
    return await ipcRenderer.invoke("getDirFiles", path);
}

export function ForceRemoveFav(displayFile){
    ipcRenderer.invoke("removeFavorites", displayFile.thumbUrl);
}

export function ForceAddFavTag(tag, remoteType) {
    ipcRenderer.invoke("AddFavTags", tag, remoteType);
}

export function ForceAddFavImage(displayFile) {
    ipcRenderer.invoke("addFavorites", displayFile.thumbUrl, displayFile.title, displayFile.sourceUrl,
        displayFile.tags, 1 /* display */, displayFile.remoteType);
}