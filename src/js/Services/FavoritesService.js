import {favoritesApi} from "../Infrastructure/Ipc"
import {ThumbFile} from "../Models/ThumbFile";

let favorites = [];
let listeners = new Set();

export const FavoritesService = {
    async init() {
        const raw = await favoritesApi.getAll();
        favorites = raw.map(el => new ThumbFile({ ...el }));
        this._notify();
    },
    getAll() { return favorites; },
    add(file) {
        if (!file?.thumbUrl || this.isFav(file.thumbUrl)) return;

        favorites = [...favorites, file];
        this._notify(file);

        favoritesApi.add(this._serialize(file))
            .then(id => { file.id = id; })
            .catch(e => {
                favorites = favorites.filter(f => f.thumbUrl !== file.thumbUrl);
                this._notify(file);
                throw e;
            });
    },
    remove(file) {
        favorites = favorites.filter(f => f.thumbUrl !== file.thumbUrl);
        this._notify(file);
        favoritesApi.remove(file.thumbUrl);
    },
    toggleFav(file) {
        if(this.isFav(file.thumbUrl))
            this.remove(file);
        else
            this.add(file);
    },
    isFav(checkThumbUrl) {
        return favorites.some(f => f.thumbUrl === checkThumbUrl?.toString());
    },
    subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
    },
    _notify(changedFile = null) {
        listeners.forEach(cb => cb(favorites, changedFile));
    },
    _serialize(file) {
        return {
            thumbUrl:   file.thumbUrl,
            title:      file.title,
            sourceUrl:  file.sourceUrl,
            tags:       Array.isArray(file.tags) ? file.tags : [],
            priority:   file.priority ?? 1,
            remoteType: file.remoteType,
        };
    },
}

export default FavoritesService;