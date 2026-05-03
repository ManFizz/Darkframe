import {libraryApi} from '../Infrastructure/Ipc';

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

    // --- Items ---

    async getItems({ collectionId } = {}) {
        if (collectionId !== undefined)
            return libraryApi.getItems({ collectionId: collectionId });

        return libraryApi.getItems({});
    },

    async importDialog(collectionId) {
        return libraryApi.importDialog({ collectionId });
    },

    async importFiles({ filePaths, collectionId, tags = [], sourceUrl = '' }) {
        return libraryApi.importFiles({ filePaths, collectionId, tags, sourceUrl });
    },

    async updateItem(id, data) {
        return libraryApi.updateItem({ id, data });
    },

    async deleteItem(id, deleteFile = false) {
        return libraryApi.deleteItem({ id, deleteFile });
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