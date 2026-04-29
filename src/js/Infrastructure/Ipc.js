const { ipcRenderer } = window.require("electron");

export async function invoke(channel, ...args) {
    try {
        return await ipcRenderer.invoke(channel, ...args);
    } catch (e) {
        console.error(`IPC error [${channel}]:`, e);
        throw e;
    }
}

export const favoritesApi = {
    getAll: () => invoke("getFavorites"),
    add: (data) => invoke("addFavorites", data),
    remove: (url) => invoke("removeFavorites", url),
};
export const favoriteTagsApi = {
    getAll: () => invoke("getFavTags"),
    add: (tag, remoteType) => invoke("AddFavTags", tag, remoteType),
};

export const tagsApi = {
    getByNames: (names) => invoke("getTagsByNames", names),
    saveTags: (tags) => invoke("saveTags", tags),
};

export const filesApi = {
    getFilesByPath: (path) => invoke("getDirFiles", path),
};