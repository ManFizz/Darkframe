import {OnUpdateFavoritesTags, OnUpdateFavorites} from "./FavController.js";
let { ipcRenderer } = require("electron");

ipcRenderer.invoke("getFavorites").then();
ipcRenderer.on('getFavorites', (event, arg) => {
    OnUpdateFavorites(arg);
});

ipcRenderer.invoke("getFavTags").then();
ipcRenderer.on('getFavTags', (event, arg) => {
    OnUpdateFavoritesTags(arg);
});

export async function GetFiles(path) {
    return await ipcRenderer.invoke("getDirFiles", path);
}

export function ForceRemoveFav(displayFile){
    ipcRenderer.invoke("removeFavorites", displayFile.thumbUrl).then();
}

export function ForceAddFavTag(tag) {
    ipcRenderer.invoke("AddFavTags", tag).then();
}

export function ForceAddFavImage(displayFile) {
    ipcRenderer.invoke("addFavorites", displayFile.thumbUrl, displayFile.name, displayFile.sourceUrl,
        displayFile.tags, 1 /* display */, displayFile.remote_type).then();
}