import {favoriteTagsApi} from "@/Infrastructure/Ipc";

let favoriteTags = [];
let listeners = new Set();

export const FavoriteTagsService = {
    async init() {
        favoriteTags = await favoriteTagsApi.getAll();
        this._notify();
    },
    getAll() { return favoriteTags },
    add(tag, remoteType) {
        if(tag == null || !Object.values(SOURCE_TYPES).includes(remoteType)) return;

        favoriteTags = [favoriteTags, tag];
        this._notify(tag);

        favoriteTagsApi.add(tag, remoteType)
            .catch(e => {
                favoriteTags = favoriteTags.filter(f => f !== tag);
                this._notify(tag);
                throw e;
            })
    },
    subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
    },
    _notify(tag) {
        listeners.forEach(cb => cb(favorites, tag));
    },
}

export default FavoriteTagsService;