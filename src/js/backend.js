import {OnUpdateFavoritesTags, OnUpdateFavorites} from "./FavController.js";

let { ipcRenderer } = require("electron");

ipcRenderer.invoke("getFavorites").then();
ipcRenderer.invoke("getFavTags").then();

export async function GetFiles(path) {
    return await ipcRenderer.invoke("getDirFiles", path);
}

export function ForceRemoveFav(url){
    ipcRenderer.invoke("removeFavorites", url).then();
}

export function ForceAddFavTagAddFavTag(tag) {
    ipcRenderer.invoke("AddFavTags", tag).then();
}

export function ForceAddFavImage(url, name, source, tags, remote_type) {
    ipcRenderer.invoke("addFavorites", url, name, source, tags, 1, remote_type).then();
}

ipcRenderer.on('getFavorites', (event, arg) => {
    OnUpdateFavorites(arg);
});


ipcRenderer.on('getFavTags', (event, arg) => {
    OnUpdateFavoritesTags(arg);
});