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
    deleteItems:       (data) => invoke('library:deleteItems', data),
    restoreItem:       (data) => invoke('library:restoreItem', data),
    restoreItems:      (data) => invoke('library:restoreItems', data),
    emptyTrash:        ()     => invoke('library:emptyTrash'),
    duplicateItem:     (data) => invoke('library:duplicateItem', data),
    trimVideo:         (data) => invoke('library:trimVideo', data),
    revertVideo:       (data) => invoke('library:revertVideo', data),
    captureVideoFrame: (data) => invoke('library:captureVideoFrame', data),
    editImage:         (data) => invoke('library:editImage', data),
    revertImage:       (data) => invoke('library:revertImage', data),
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
    getDashboard:      ()     => invoke('library:getDashboard'),
    findDuplicates:    ()     => invoke('library:findDuplicates'),
    checkIntegrity:    ()     => invoke('library:checkIntegrity'),
    cleanupIntegrity:  (data) => invoke('library:cleanupIntegrity', data),
    generateMissingMedia: ()  => invoke('library:generateMissingMedia'),
    // View history / recently viewed
    recordView:        (data) => invoke('library:recordView', data),
    getHistory:        (params) => invoke('library:getHistory', params),
    getHistorySections: ()    => invoke('library:getHistorySections'),
    clearHistory:      (params) => invoke('library:clearHistory', params),
    removeHistory:     (data) => invoke('library:removeHistory', data),
    reorderCollections: (data) => invoke('library:reorderCollections', data),
    // Tag manager
    getAllTags:        ()     => invoke('library:getAllTags'),
    renameTag:         (data) => invoke('library:renameTag', data),
    mergeTags:         (data) => invoke('library:mergeTags', data),
    deleteTag:         (data) => invoke('library:deleteTag', data),
    getTagRules:       ()     => invoke('library:getTagRules'),
    addTagRule:        (data) => invoke('library:addTagRule', data),
    deleteTagRule:     (data) => invoke('library:deleteTagRule', data),
    // Smart collections
    getSmartItems:     (filter) => invoke('library:getSmartItems', { filter }),
    createSmartCollection: (data) => invoke('library:createSmartCollection', data),
    updateSmartFilter: (data) => invoke('library:updateSmartFilter', data),
};

export const apiTokensApi = {
    config:         ()             => invoke('apitokens:config'),
    list:           ()             => invoke('apitokens:list'),
    create:         (data)         => invoke('apitokens:create', data),
    revoke:         (id)           => invoke('apitokens:revoke', { id }),
    setEnabled:     (id, enabled)  => invoke('apitokens:setEnabled', { id, enabled }),
    setRequireAuth: (value)        => invoke('apitokens:setRequireAuth', { value }),
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