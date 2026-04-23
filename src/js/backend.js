import {Favorites, OnUpdateFavorites} from "./FavController.js";
import Collection from "./Collection";
import {getAllTags, initTagsFromDB} from "./TagsController";

const { ipcRenderer } = window.require("electron");

export let setFavTagsArray = () => {
    console.warn("setFavTagsArray ещё не инициализирован");
};

let isInitialized = false;

export async function InitDatabaseData() {
    if (isInitialized) return;
    isInitialized = true;

    try {
        console.log("Инициализация базы данных...");

        const [favs, tags, favTags] = await Promise.all([
            ipcRenderer.invoke("getFavorites").catch(() => []),
            ipcRenderer.invoke("getTags").catch(() => []),
            ipcRenderer.invoke("getFavTags").catch(() => [])
        ]);

        OnUpdateFavorites(favs);
        initTagsFromDB(tags);

        if (typeof setFavTagsArray === 'function') {
            setFavTagsArray(favTags);
        }

    } catch (e) {
        console.error("Критическая ошибка инициализации:", e);
    }
}

export async function GetFiles(path) {
    return await ipcRenderer.invoke("getDirFiles", path);
}

export function ForceRemoveFav(displayFile) {
    ipcRenderer.invoke("removeFavorites", displayFile.thumbUrl).catch(console.error);
}

export async function ForceAddFavImage(displayFile) {
    try {
        const tagsString = Array.isArray(displayFile.tags)
            ? displayFile.tags.join(" ")
            : displayFile.tags;

        return await ipcRenderer.invoke(
            "addFavorites",
            displayFile.thumbUrl,
            displayFile.title,
            displayFile.sourceUrl,
            tagsString,
            1,
            displayFile.remoteType
        );
    } catch (error) {
        console.warn("Backend error (likely duplicate):", error.message);
        return displayFile.id;
    }
}

export function ForceAddFavTag(tag, remoteType) {
    ipcRenderer.invoke("AddFavTags", tag, remoteType).catch(console.error);
}

export async function GetFavTags() {
    return await ipcRenderer.invoke("getFavTags");
}

export function SaveTags() {
    const tags = getAllTags();
    tags.forEach(tag => {
        if( tag.name === undefined || tag.name === null ||
            tag.type === undefined || tag.type === null ||
            tag.count === undefined || tag.count === null
        ) {
            console.error("Tag ", tag.name, " can't be saved. Tag:", tag);
        }
    })
    ipcRenderer.invoke("setTags", tags).catch(console.error);
}

export async function GetCollections() {
    const dataFromDatabase = await ipcRenderer.invoke("GetCollections");
    if (!dataFromDatabase) return [];

    const collections = {};
    const favMap = new Map();

    Favorites.forEach(f => {
        favMap.set(f.id, f);
        favMap.set(f.thumbUrl, f);
    });

    dataFromDatabase.forEach(item => {
        if (!collections[item.colId]) {
            collections[item.colId] = new Collection(item.colName, item.colId);
        }

        const favorite = favMap.get(item.id) || favMap.get(item.url);

        if (favorite) {
            if (!favorite.collectionsIds) favorite.collectionsIds = [];
            if (!favorite.collectionsIds.includes(item.colId)) {
                favorite.collectionsIds.push(item.colId);
            }
            collections[item.colId].addImage(favorite);
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