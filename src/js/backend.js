import {Favorites, OnUpdateFavorites} from "./FavController.js";
import Collection from "./Collection";
import {notify} from "./Services/NotificationService.js";

const { ipcRenderer } = window.require("electron");

export let setFavTagsArray = () => {
    console.warn("setFavTagsArray ещё не инициализирован");
};

let isInitialized = false;

function notifyError(message, error = null) {
    console.error(message, error);

    try {
        const audio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
        audio.play().catch(() => {});
    } catch {}

    notify({
        message: message + " (данные могут быть утеряны)",
        type: "danger"
    });
}

async function safeInvoke(channel, fallback = null, ...args) {
    try {
        return await ipcRenderer.invoke(channel, ...args);
    } catch (e) {
        notifyError(`Ошибка запроса: ${channel}`, e);
        return fallback;
    }
}

export async function InitDatabaseData() {
    if (isInitialized) return;
    isInitialized = true;

    console.log("Инициализация базы данных...");

    try {
        const [favs, favTags] = await Promise.all([
            safeInvoke("getFavorites", []),
            safeInvoke("getFavTags", [])
        ]);

        OnUpdateFavorites(favs);

        if (typeof setFavTagsArray === "function") {
            setFavTagsArray(favTags);
        }
    } catch (e) {
        notifyError("Критическая ошибка инициализации", e);
    }
}

export async function GetFiles(path) {
    return await safeInvoke("getDirFiles", [], path);
}

export function ForceRemoveFav(displayFile) {
    safeInvoke("removeFavorites", null, displayFile.thumbUrl);
}

export async function ForceAddFavImage(displayFile) {
    try {
        const tagsString = Array.isArray(displayFile.tags)
            ? displayFile.tags.join(" ")
            : displayFile.tags;

        return await safeInvoke(
            "addFavorites",
            displayFile.id,
            displayFile.thumbUrl,
            displayFile.title,
            displayFile.sourceUrl,
            tagsString,
            1,
            displayFile.remoteType
        );
    } catch (e) {
        notifyError("Ошибка добавления в избранное", e);
        return displayFile.id;
    }
}

export function ForceAddFavTag(tag, remoteType) {
    safeInvoke("AddFavTags", null, tag, remoteType);
}

export async function GetFavTags() {
    return await safeInvoke("getFavTags", []);
}

export async function GetCollections() {
    const dataFromDatabase = await safeInvoke("GetCollections", []);
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
    await safeInvoke("UpdateCollections", null, collections);
}

export function SaveTags(tags) {
    safeInvoke("setTags", null, tags);
}

export function getTagsByNames(names) {
    return safeInvoke("getTagsByNames", null, names);
}