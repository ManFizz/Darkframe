import {appUrl, ipcRenderer} from './electron';

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
    remove: (tag, remoteType) => invoke("RemoveFavTags", tag, remoteType),
    reorder: (remoteType, tags) => invoke("ReorderFavTags", remoteType, tags),
};

export const tagsApi = {
    getByNames: (names) => invoke("getTagsByNames", names),
    saveTags:   (tags)  => invoke("saveTags", tags),
};

// Folders browser (see server/controllers/fsController).
export const fsApi = {
    list:   (dir)  => invoke('fs:list', { dir }),
    drives: ()     => invoke('fs:drives'),
    info:   (file) => invoke('fs:info', { file }),
    reveal: (file) => invoke('fs:reveal', { file }),
    open:   (file) => invoke('fs:open', { file }),
    rename: (from, name)  => invoke('fs:rename', { from, name }),
    mkdir:  (dir, name)   => invoke('fs:mkdir', { dir, name }),
    move:   (paths, dest) => invoke('fs:move', { paths, dest }),
    trash:  (paths)       => invoke('fs:trash', { paths }),
    libraryCheck: (files) => invoke('fs:libraryCheck', { files }),
};

// Drag payload for files dragged out of the Folders grid.
export const DRAG_PATHS = 'application/x-darkframe-paths';

export const openExternalUrl = (url) => invoke('shell:openUrl', { url });

// Seek-bar preview sprite for a library ({ itemId }) or folder ({ path }) video.
export const getStoryboard = (req) => invoke('media:storyboard', req);

export const mangaApi = {
    book:            (id)                    => invoke('manga:book', { id }),
    saveProgress:    (id, pos)               => invoke('manga:saveProgress', { id, ...pos }),
    resetProgress:   (id)                    => invoke('manga:resetProgress', { id }),
    setReading:      (id, reading)           => invoke('manga:setReading', { id, reading }),
    recent:          (limit)                 => invoke('manga:recent', { limit }),
    savePage:        (opts)                  => invoke('manga:savePage', opts),
    removePages:     (id, files)             => invoke('manga:removePages', { id, files }),
    restorePages:    (id, stored)            => invoke('manga:restorePages', { id, stored }),
    purgeRemoved:    (id)                    => invoke('manga:purgeRemoved', { id }),
    reorder:         (id, orders)            => invoke('manga:reorder', { id, orders }),
    setCover:        (id, file)              => invoke('manga:setCover', { id, file }),
    renameChapter:   (id, chapter, title)    => invoke('manga:renameChapter', { id, chapter, title }),
    addPagesDialog:  (id, opts = {})         => invoke('manga:addPagesDialog', { id, ...opts }),
    fromItems:       (ids, opts = {})        => invoke('manga:fromItems', { ids, ...opts }),
    fromFiles:       (files, opts = {})      => invoke('manga:fromFiles', { files, ...opts }),
    importFolderDialog: (opts = {})          => invoke('manga:importFolderDialog', opts),
    importFolder:    (dir, opts = {})        => invoke('manga:importFolder', { dir, ...opts }),
    planFolder:      (dir, mode)             => invoke('manga:planFolder', { dir, mode }),
    importArchiveDialog: (opts = {})         => invoke('manga:importArchiveDialog', opts),
    importArchives:  (files, collectionId)   => invoke('manga:importArchives', { files, collectionId }),
    exportCbz:       (id)                    => invoke('manga:exportCbz', { id }),
    exportFolder:    (id)                    => invoke('manga:exportFolder', { id }),
    split:           (id)                    => invoke('manga:split', { id }),

    // Online sources
    sources:         ()                      => invoke('manga:sources'),
    search:          (opts)                  => invoke('manga:search', opts),
    suggest:         (source, text, type)    => invoke('manga:suggest', { source, text, type }),
    browseTags:      (source, type, opts={}) => invoke('manga:browseTags', { source, type, ...opts }),
    loginState:      (source)                => invoke('manga:loginState', { source }),
    gallery:         (source, id)            => invoke('manga:gallery', { source, id }),
    chapter:         (source, id, chapterId) => invoke('manga:chapter', { source, id, chapterId }),
    resolveUrl:      (url)                   => invoke('manga:resolveUrl', { url }),
    inLibrary:       (source, ids)           => invoke('manga:inLibrary', { source, ids }),
    download:        (opts)                  => invoke('manga:download', opts),
    downloadUrl:     (url, collectionId)     => invoke('manga:downloadUrl', { url, collectionId }),
    downloads:       ()                      => invoke('manga:downloads'),
    newChapters:     (itemId)                => invoke('manga:newChapters', { itemId }),
    downloadAction:  (id, action)            => invoke('manga:downloadAction', { id, action }),
    clearDownloads:  ()                      => invoke('manga:clearDownloads'),
    login:           (source)                => invoke('manga:login', { source }),
    openSite:        (source, url)           => invoke('manga:openSite', { source, url }),
    clearCache:      ()                      => invoke('manga:clearCache'),
    addOnline:       (opts)                  => invoke('manga:addOnline', opts),
    downloadRemote:  (itemId, chapters)      => invoke('manga:downloadRemote', { itemId, chapters }),
    subscriptions:   ()                      => invoke('manga:subscriptions'),
    setSubscription: (itemId, on)            => invoke('manga:setSubscription', { itemId, on }),
    setSeen:         (itemId)                => invoke('manga:setSeen', { itemId }),
    checkUpdates:    (itemId = null)         => invoke('manga:updateSubscriptions', { itemId }),
    subsConfig:      ()                      => invoke('manga:subsConfig'),
    setSubsConfig:   (patch)                 => invoke('manga:setSubsConfig', patch),
    onSubs:          (fn)                    => {
        const handler = (_, p) => fn(p);
        ipcRenderer.on('manga:subs', handler);
        return () => ipcRenderer.removeListener('manga:subs', handler);
    },
    onUpdates:       (fn)                    => {
        const handler = (_, p) => fn(p);
        ipcRenderer.on('manga:updates', handler);
        return () => ipcRenderer.removeListener('manga:updates', handler);
    },
    onDownloads:     (fn)                    => {
        const handler = (_, p) => fn(p);
        ipcRenderer.on('manga:downloads', handler);
        return () => ipcRenderer.removeListener('manga:downloads', handler);
    },
};

export const autotagApi = {
    status:   ()          => invoke('autotag:status'),
    download: ()          => invoke('autotag:download'),
    remove:   ()          => invoke('autotag:remove'),
    settings: (patch)     => invoke('autotag:settings', patch),
    suggest:  (ids)       => invoke('autotag:suggest', { ids }),
    apply:    (tagsById)  => invoke('autotag:apply', { tagsById }),
};

export const watchFoldersApi = {
    list:           ()       => invoke('watch:list'),
    save:           (folder) => invoke('watch:save', { folder }),
    remove:         (id)     => invoke('watch:remove', { id }),
    importExisting: (id)     => invoke('watch:importExisting', { id }),
    pickDir:        ()       => invoke('watch:pickDir'),
    onChanged:      (fn)     => {
        const handler = (_, p) => fn(p);
        ipcRenderer.on('watch:changed', handler);
        return () => ipcRenderer.removeListener('watch:changed', handler);
    },
};

export const autoRulesApi = {
    list:    ()     => invoke('autoRules:list'),
    save:    (rule) => invoke('autoRules:save', { rule }),
    remove:  (id)   => invoke('autoRules:remove', { id }),
    preview: (rule) => invoke('autoRules:preview', { rule }),
    apply:   (id)   => invoke('autoRules:apply', { id }),
};

export const savedSearchesApi = {
    list:    ()                       => invoke('savedSearches:list'),
    add:     (source, query, title)   => invoke('savedSearches:add', { source, query, title }),
    remove:  (id)                     => invoke('savedSearches:remove', { id }),
    restore: (row)                    => invoke('savedSearches:restore', { row }),
    update:  (id, patch)              => invoke('savedSearches:update', { id, patch }),
    reorder: (source, ids)            => invoke('savedSearches:reorder', { source, ids }),
};

// fsthumb:// URL of a cached thumbnail for a file on disk.
// A folder video the player can't open directly (.ts …) → played through the app.
export const fsVideoUrl = (file) => appUrl(`fsthumb://v/?p=${encodeURIComponent(file)}`);
export const fsThumbUrl = (file, width = 360) =>
    appUrl(`fsthumb://t/?p=${encodeURIComponent(file)}&w=${width}`);

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
    setVideoThumb:     (data) => invoke('library:setVideoThumb', data),
    getVideoPosition:  (data) => invoke('library:getVideoPosition', data),
    saveVideoPosition: (data) => invoke('library:saveVideoPosition', data),
    editImage:         (data) => invoke('library:editImage', data),
    revertImage:       (data) => invoke('library:revertImage', data),
    recompressImage:   (data) => invoke('library:recompressImage', data),
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
    revealItem:        (data) => invoke('library:revealItem', data),
    findDuplicates:    ()     => invoke('library:findDuplicates'),
    phashStatus:       ()     => invoke('library:phashStatus'),
    computePhashes:    ()     => invoke('library:computePhashes'),
    findSimilar:       (data) => invoke('library:findSimilar', data),
    itemRelations:     (id)   => invoke('library:itemRelations', { id }),
    visualSearch:      (q)    => invoke('library:visualSearch', q),
    paste:             (collectionId) => invoke('library:paste', { collectionId }),
    undo:              ()     => invoke('library:undo'),
    redo:              ()     => invoke('library:redo'),
    undoState:         ()     => invoke('library:undoState'),
    sourceUrls:        ()     => invoke('library:sourceUrls'),
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
    setTagPinned:      (data) => invoke('library:setTagPinned', data),
    getPinnedTags:     ()     => invoke('library:getPinnedTags'),
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

export const remoteApi = {
    status:       ()                 => invoke('remote:status'),
    setSettings:  (s)                => invoke('remote:setSettings', s),
    createCode:   (opts = {})        => invoke('remote:createCode', opts),
    updateDevice: (id, patch)        => invoke('remote:updateDevice', { id, ...patch }),
    revoke:       (id)               => invoke('remote:revoke', { id }),
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
};