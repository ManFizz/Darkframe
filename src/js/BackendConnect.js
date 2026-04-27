import {OnUpdateFavorites} from "./Controllers/FavoritesController";
import {notify} from "./Services/NotificationService";

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

export function SaveTags(tags) {
    safeInvoke("setTags", null, tags);
}

export function getTagsByNames(names) {
    return safeInvoke("getTagsByNames", null, names);
}