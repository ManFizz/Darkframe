import {OnUpdateFavoritesTags, OnUpdateFavorites} from "./FavController.mjs";

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

export function ForceAddFavImage(url, name, source, tags) {
    ipcRenderer.invoke("addFavorites", url, name, source, tags).then();
}

ipcRenderer.on('getFavorites', (event, arg) => {
    OnUpdateFavorites(arg);
});


ipcRenderer.on('getFavTags', (event, arg) => {
    OnUpdateFavoritesTags(arg);
});