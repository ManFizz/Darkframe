// noinspection JSIgnoredPromiseFromCall

import { Favorites, OnUpdateFavorites } from "./FavController.js";
import { setFavTagsArray } from "./AppInitializer";
import Collection from "./Collection";
import { GetTags, UpdateTagsData } from "./TagsController";

let { ipcRenderer } = require("electron");

ipcRenderer.invoke("getFavorites");
ipcRenderer.on('getFavorites', (event, arg) => {
    OnUpdateFavorites(arg);
});

export async function GetFavTags() {
    return await ipcRenderer.invoke("getFavTags");
}

ipcRenderer.on('getFavTags', (event, tags) => {
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

export async function ForceAddFavImage(displayFile) {
    return await ipcRenderer.invoke("addFavorites", displayFile.thumbUrl, displayFile.title, displayFile.sourceUrl,
        displayFile.tags, 1, displayFile.remoteType);
}

export async function GetCollections() {
    const dataFromDatabase = await ipcRenderer.invoke("GetCollections");
    const collections = {};

    dataFromDatabase.forEach(item => {
        if (!collections[item.colId]) {
            collections[item.colId] = new Collection(item.colName, item.colId);
        }

        const favorite = Favorites.find(fav => fav.id === item.id);
        if (favorite) {
            if(!favorite.collectionsIds)
                favorite.collectionsIds = [];

            favorite.collectionsIds.push(item.colId);
            collections[item.colId].addImage(favorite);
        } else {
            console.log('Error: favorite not found', item.id);
        }
    });

    return Object.values(collections);
}

export async function UpdateCollections(collections) {
    try {
        await ipcRenderer.invoke("UpdateCollections", collections);
    } catch (error) {
        console.error("Error updating collections:", error);
    }
}

export function SaveTags() {
    const tags = GetTags();
    ipcRenderer.invoke("setTags", tags);
}

GetTagsFromDataBase();
export function GetTagsFromDataBase() {
    ipcRenderer.invoke("getTags").then(r => {
        UpdateTagsData(r, true);
    });
}