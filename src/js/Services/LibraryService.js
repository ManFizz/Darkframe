import {libraryApi} from '@/Infrastructure/Ipc';

let collections = [];
let listeners = new Set();

export const LibraryService = {

    async loadCollections() {
        const raw = await libraryApi.getCollections();
        collections = raw;
        this._notify();
        return collections;
    },

    getCollections() { return collections; },

    getTree() {
        const map = {};
        collections.forEach(c => { map[c.id] = { ...c, children: [] }; });

        const roots = [];
        collections.forEach(c => {
            if (c.parentId && map[c.parentId]) {
                map[c.parentId].children.push(map[c.id]);
            } else {
                roots.push(map[c.id]);
            }
        });

        return roots;
    },

    async createCollection({ name, parentId = null, icon = null, color = null }) {
        const created = await libraryApi.createCollection({ name, parentId, icon, color });
        await this.loadCollections();
        return created;
    },

    async updateCollection(id, data) {
        await libraryApi.updateCollection({ id, data });
        await this.loadCollections();
    },

    async deleteCollection(id) {
        await libraryApi.deleteCollection({ id });
        await this.loadCollections();
    },

    async reorderCollections(updates) {
        await libraryApi.reorderCollections({ updates });
        await this.loadCollections();
    },
    // --- Items ---

    async getItems({ collectionId, trash = false } = {}) {
        if (trash)
            return libraryApi.getItems({ trash: true });

        if (collectionId !== undefined)
            return libraryApi.getItems({ collectionId: collectionId });

        return libraryApi.getItems({});
    },

    async getSmartItems(filter) {
        return libraryApi.getSmartItems(filter);
    },

    async createSmartCollection(name, filter) {
        const created = await libraryApi.createSmartCollection({ name, filter });
        await this.loadCollections();
        return created;
    },

    async updateSmartFilter(id, filter) {
        return libraryApi.updateSmartFilter({ id, filter });
    },

    // --- Tag manager ---
    getAllTags()               { return libraryApi.getAllTags(); },
    renameTag(id, newName)     { return libraryApi.renameTag({ id, newName }); },
    mergeTags(sourceId, targetId) { return libraryApi.mergeTags({ sourceId, targetId }); },
    deleteTag(id)              { return libraryApi.deleteTag({ id }); },
    getTagRules()              { return libraryApi.getTagRules(); },
    addTagRule(from, to, applyExisting = true) { return libraryApi.addTagRule({ from, to, applyExisting }); },
    deleteTagRule(id)          { return libraryApi.deleteTagRule({ id }); },

    async importDialog(collectionId) {
        return libraryApi.importDialog({ collectionId });
    },

    async importFiles({ filePaths, collectionId, tags = [], sourceUrl = '', allowDuplicate = false }) {
        return libraryApi.importFiles({ filePaths, collectionId, tags, sourceUrl, allowDuplicate });
    },

    async importDirectoryDialog(collectionId) {
        return libraryApi.importDirectoryDialog({ collectionId });
    },

    async importDirectory({ dirPath, collectionId }) {
        return libraryApi.importDirectory({ dirPath, collectionId });
    },

    async importUrl({ url, collectionId }) {
        return libraryApi.importUrl({ url, collectionId });
    },

    async updateItem(id, data) {
        return libraryApi.updateItem({ id, data });
    },

    async bulkUpdateItems(updates) {
        return libraryApi.bulkUpdateItems({ updates });
    },

    // permanent=false → moves to trash; permanent=true → wipes it for good.
    async deleteItem(id, permanent = false) {
        return libraryApi.deleteItem({ id, permanent });
    },

    async deleteItems(ids, permanent = false) {
        return libraryApi.deleteItems({ ids, permanent });
    },

    async restoreItem(id) {
        return libraryApi.restoreItem({ id });
    },

    async restoreItems(ids) {
        return libraryApi.restoreItems({ ids });
    },

    async findDuplicates() {
        return libraryApi.findDuplicates();
    },

    async checkIntegrity() {
        return libraryApi.checkIntegrity();
    },

    async cleanupIntegrity(missingIds, orphanNames) {
        return libraryApi.cleanupIntegrity({ missingIds, orphanNames });
    },

    async generateMissingMedia() {
        return libraryApi.generateMissingMedia();
    },

    // --- View history ---
    async recordView(payload) {
        return libraryApi.recordView(payload);
    },
    async getHistory(section = null) {
        return libraryApi.getHistory({ section });
    },
    async getHistorySections() {
        return libraryApi.getHistorySections();
    },
    async clearHistory(section = null) {
        return libraryApi.clearHistory({ section });
    },
    async removeHistory(ids) {
        return libraryApi.removeHistory({ ids });
    },

    async emptyTrash() {
        return libraryApi.emptyTrash();
    },

    async duplicateItem(id) {
        return libraryApi.duplicateItem({ id });
    },

    // opts: { start, end, mode: 'precise' | 'fast', backup }
    async trimVideo(id, opts) {
        return libraryApi.trimVideo({ id, ...opts });
    },

    async revertVideo(id) {
        return libraryApi.revertVideo({ id });
    },

    // { itemId } for a library video, or { url, title, tags, sourceUrl } for remote/folder
    async captureVideoFrame(params) {
        return libraryApi.captureVideoFrame(params);
    },

    async setVideoThumb(id, time) {
        return libraryApi.setVideoThumb({ id, time });
    },

    // mk = mediaKey(file): { section, key }
    async getVideoPosition(mk) {
        return libraryApi.getVideoPosition(mk);
    },
    async saveVideoPosition(mk, position, duration) {
        return libraryApi.saveVideoPosition({ ...mk, position, duration });
    },

    // transform: { angle, flipH, flipV, crop:{x,y,w,h} } — crop in fractions of the rotated image
    async editImage(id, transform) {
        return libraryApi.editImage({ id, ...transform });
    },

    async revertImage(id) {
        return libraryApi.revertImage({ id });
    },

    async importFromEagle({ csvPath, collectionId } = {}) {
        if (csvPath) {
            return libraryApi.importFromEagle({ csvPath, collectionId });
        }
        return libraryApi.importEagleDialog({ collectionId });
    },

    async importFromJson({ jsonPath, collectionId } = {}) {
        if (jsonPath) {
            return libraryApi.importFromJson({ jsonPath, collectionId });
        }
        return libraryApi.importJsonDialog({ collectionId });
    },
    // --- Pub/Sub ---

    subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
    },

    _notify() {
        listeners.forEach(cb => cb(collections));
    },
};

export default LibraryService;