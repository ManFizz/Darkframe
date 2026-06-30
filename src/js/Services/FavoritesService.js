import {favoritesApi} from "@/Infrastructure/Ipc";
import {ThumbFile} from "@/Models/ThumbFile";
import {FILE_TYPES, SOURCE_TYPES} from "@/Constants";
import {notify} from "@services/NotificationService";

// Favourites are real library Items living in the per-library Favorites
// collection. We dedupe/identify them by their origin (the post page a media
// came from), which is stored on the Item's sourceUrl.
const favKey = (file) => file?.sourceUrl || file?.contentUrl || file?.thumbUrl || '';

let favorites = [];
let favSet = new Set();
let pending = new Set();   // keys currently being downloaded/imported
let listeners = new Set();

function toThumbFile(it) {
    return new ThumbFile({
        id:         it.id,
        title:      it.title || it.fileName,
        thumbUrl:   it.thumbPath,
        contentUrl: it.originalPath,
        sourceUrl:  it.sourceUrl,
        tags:       it.tags,
        rating:     it.rating,
        width:      it.width,
        height:     it.height,
        remoteType: SOURCE_TYPES.LIBRARY,
        type:       (it.mimeType || '').startsWith('video/') ? FILE_TYPES.VIDEO : FILE_TYPES.IMAGE,
    });
}

export const FavoritesService = {
    async init() {
        const raw = await favoritesApi.list();
        favorites = raw.map(toThumbFile);
        favSet = new Set(favorites.map(favKey));
        this._notify();
    },

    getAll() { return favorites; },

    isFav(fileOrUrl) {
        const key = typeof fileOrUrl === 'string' ? fileOrUrl : favKey(fileOrUrl);
        return key !== '' && favSet.has(key);
    },

    isPending(fileOrUrl) {
        const key = typeof fileOrUrl === 'string' ? fileOrUrl : favKey(fileOrUrl);
        return key !== '' && pending.has(key);
    },

    add(file) {
        const key = favKey(file);
        if (!key || favSet.has(key) || pending.has(key)) return;

        // Downloading + importing can take a while; surface that with a spinner
        // on the heart (pending) and toasts so it's clear something is happening.
        pending.add(key);
        this._notify(file);
        notify({ message: '⏳ Добавление в избранное…', type: 'info', duration: 2500 });

        favoritesApi.add({
            mediaUrl:   file.getUrl(),
            postUrl:    key,
            title:      file.title,
            tags:       Array.isArray(file.tags) ? file.tags : [],
        }).then(res => {
            pending.delete(key);
            if (!res?.ok) {
                this._notify(file);
                notify({ message: `Не удалось добавить: ${res?.error || 'ошибка'}`, type: 'danger', duration: 6000 });
            } else if (res.skipped) {
                // Content already exists in the library (dedup by hash) — no new
                // favourite item with this post URL, so don't claim it's favourited.
                this._notify(file);
                notify({ message: 'Уже есть в библиотеке (дубликат)', type: 'warning' });
            } else {
                // The library Favorites view loads its own items lazily, so we only
                // need to track the key here (no full reload).
                favSet.add(key);
                this._notify(file);
                notify({ message: '★ Добавлено в избранное', type: 'success' });
            }
        }).catch(e => {
            pending.delete(key);
            this._notify(file);
            notify({ message: `Ошибка добавления: ${e.message}`, type: 'danger', duration: 6000 });
        });
    },

    remove(file) {
        const key = favKey(file);
        if (!key) return;

        favSet.delete(key);
        favorites = favorites.filter(f => favKey(f) !== key);
        this._notify(file);

        favoritesApi.remove(key);
        notify({ message: 'Удалено из избранного', type: 'info', duration: 2000 });
    },

    toggleFav(file) {
        this.isFav(file) ? this.remove(file) : this.add(file);
    },

    subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
    },

    _notify(changedFile = null) {
        listeners.forEach(cb => cb(favorites, changedFile));
    },
}

export default FavoritesService;
