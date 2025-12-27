import {Favorites, OnUpdateFavorites} from "./FavController.js";
import {setFavTagsArray} from "./AppInitializer";
import Collection from "./Collection";
import {GetTags, UpdateTagsData} from "./TagsController";

const { ipcRenderer } = window.require("electron");

export async function InitDatabaseData() {
    try {
        const [favs, tags, favTags] = await Promise.all([
            ipcRenderer.invoke("getFavorites").catch(() => []),
            ipcRenderer.invoke("getTags").catch(() => []),
            ipcRenderer.invoke("getFavTags").catch(() => [])
        ]);

        OnUpdateFavorites(favs);
        UpdateTagsData(tags, true);
        setFavTagsArray(favTags);
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
            tagsString, // <--- Отправляем строку, а не массив
            1,
            displayFile.remoteType
        );
    } catch (error) {
        console.warn("Backend error (likely duplicate):", error.message);
        return displayFile.id;
    }
}

export async function GetFavTags() {
    return await ipcRenderer.invoke("getFavTags");
}

export function ForceAddFavTag(tag, remoteType) {
    ipcRenderer.invoke("AddFavTags", tag, remoteType).catch(console.error);
}

export function SaveTags() {
    const tags = GetTags();
    ipcRenderer.invoke("setTags", tags).catch(console.error);
}

export async function GetCollections() {
    const dataFromDatabase = await ipcRenderer.invoke("GetCollections");
    if (!dataFromDatabase) return [];

    const collections = {};

    // Создаем карту поиска: ключ - ID, значение - объект файла
    // Это ускоряет поиск с O(N) до O(1)
    const favMap = new Map();
    Favorites.forEach(f => {
        favMap.set(f.id, f);
        favMap.set(f.thumbUrl, f); // На всякий случай для поиска по URL
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