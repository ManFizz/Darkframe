import {GetThumbByData} from "./Controllers/GalleryController.js";
import {ForceAddFavImage, ForceAddFavTag, ForceRemoveFav} from './backend.js';
import {ThumbFile} from "./ThumbFile";
import {updateGalleryFile} from "./AppInitializer";

export let Favorites = [];

let listeners = [];

export function subscribeFavorites(cb) {
    listeners.push(cb);
    return () => {
        listeners = listeners.filter(l => l !== cb);
    };
}

function notify() {
    listeners.forEach(cb => cb(Favorites));
}

export function OnUpdateFavorites(arr) {
    if (!Array.isArray(arr)) {
        Favorites = [];
        notify();
        return;
    }

    Favorites = arr.map(el => new ThumbFile({ ...el, _fav: true }));
    notify();
}

export function AddFavTag(tag, remoteType) {
    ForceAddFavTag(tag, remoteType);
}

export function removeFav(displayFile) {
    if (!displayFile?.thumbUrl) return;

    const index = Favorites.findIndex(f => f.thumbUrl === displayFile.thumbUrl);
    if (index === -1) return;

    const fav = Favorites[index];

    Favorites.splice(index, 1);

    fav.setFavState(false);
    displayFile.setFavState(false);

    ForceRemoveFav(displayFile);

    updateGalleryFile(displayFile);
    notify();
}

export function addFav(displayFile) {
    if (!displayFile?.thumbUrl) return;

    if (isFav(displayFile.thumbUrl)) return;

    displayFile.setFavState(true);

    Favorites.push(displayFile);

    ForceAddFavImage(displayFile)
        .then(id => {
            displayFile.id = id;
            displayFile.updateUniqueId();
        })
        .catch(console.error);

    updateGalleryFile(displayFile);
    notify();
}

export function isFav(url) {
    if (!url) return false;

    const str = url.toString();
    return Favorites.some(f => f.thumbUrl.toString() === str);
}

export function favToDisplayFile(favData) {
    const { name, url, display, source, tags, remote_type } = favData;

    return GetThumbByData({
        thumbUrl: url,
        remoteType: remote_type,
        tags,
        sourceUrl: source,
        title: name,
        priority: display,
    });
}