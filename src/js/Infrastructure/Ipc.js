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
    list:   ()        => invoke("favorites:list"),
    add:    (data)    => invoke("favorites:add", data),
    remove: (postUrl) => invoke("favorites:remove", { postUrl }),
};
export const favoriteTagsApi = {
    getAll: ()                => invoke("getFavTags"),
    add:    (tag, remoteType) => invoke("AddFavTags", tag, remoteType),
};

export const tagsApi = {
    getByNames: (names) => invoke("getTagsByNames", names),
    saveTags:   (tags)  => invoke("saveTags", tags),
};

export const filesApi = {
    getFilesByPath: (path) => invoke("getDirFiles", path),
};

export const libraryApi = {
    importDialog:      (data) => invoke('library:importDialog', data),
    importFiles:       (data) => invoke('library:importFiles', data),
    getItems:          (data) => invoke('library:getItems', data),
    updateItem:        (data) => invoke('library:updateItem', data),
    bulkUpdateItems:   (data) => invoke('library:bulkUpdateItems', data),
    deleteItem:        (data) => invoke('library:deleteItem', data),
    getCollections:    ()     => invoke('library:getCollections'),
    createCollection:  (data) => invoke('library:createCollection', data),
    updateCollection:  (data) => invoke('library:updateCollection', data),
    deleteCollection:  (data) => invoke('library:deleteCollection', data),
    searchTags:        (query)=> invoke('library:searchTags', { query }),
    reorderItems:      (orderedIds) => invoke('library:reorderItems', { orderedIds }),
    importDirectoryDialog: (data) => invoke('library:importDirectoryDialog', data),
    importDirectory:   (data) => invoke('library:importDirectory', data),
    importEagleDialog: (data) => invoke('library:importEagleDialog', data),
    importFromEagle:   (data) => invoke('library:importFromEagle', data),
    importJsonDialog:  (data) => invoke('library:importJsonDialog', data),
    importFromJson:    (data) => invoke('library:importFromJson', data),
    importUrl:         (data) => invoke('library:importUrl', data),
    getStats:          ()     => invoke('library:getStats'),
    reorderCollections: (data) => invoke('library:reorderCollections', data),
};

export const libraryRegistryApi = {
    list:        ()                       => invoke('library:registry:list'),
    pickFolder:  ()                       => invoke('library:registry:pickFolder'),
    add:         (name, folderPath)       => invoke('library:registry:add', { name, folderPath }),
    rename:      (id, name)               => invoke('library:registry:rename', { id, name }),
    remove:      (id, deleteFiles=false)  => invoke('library:registry:remove', { id, deleteFiles }),
    switch:      (id)                     => invoke('library:registry:switch', { id }),
};

export const configApi = {
    get:      ()     => invoke('config:get'),
    save:     (data) => invoke('config:save', data),
    relaunch: ()     => invoke('config:relaunch'),
};