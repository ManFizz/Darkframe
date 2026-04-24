import {GetThumbByData} from "./Controllers/GalleryController.js";
import {ForceAddFavImage, ForceAddFavTag, ForceRemoveFav} from './backend.js';
import {ThumbFile} from "./ThumbFile";
import {updateGalleryFile} from "./AppInitializer";

export let Favorites = [];

export function OnUpdateFavorites(arr) {
    if (!arr || !Array.isArray(arr)) {
        Favorites = [];
        return;
    }

    Favorites = arr.map(el => new ThumbFile(el));
}

export function AddFavTag(tag, remoteType) {
    ForceAddFavTag(tag, remoteType);
}

export function removeFav(displayFile) {
    if (!displayFile.isFav()) throw new Error('removeFav :: error');

    const updatedFile = new ThumbFile({
        ...displayFile,
        _fav: false
    });

    const indexToDelete = Favorites.findIndex(fav => fav.id === displayFile.id);

    if (indexToDelete !== -1) {
        Favorites.splice(indexToDelete, 1);

        ForceRemoveFav(displayFile);            // TODO: Реализовать согласованность с БД
        updateGalleryFile(updatedFile);
    }
}

export function addFav(displayFile) {
    if (displayFile.isFav()) throw new Error('addFav :: error');

    const updatedFile = new ThumbFile({
        ...displayFile,
        _fav: true
    });

    Favorites.push(updatedFile);

    ForceAddFavImage(updatedFile).then(id => {  // TODO: Реализовать согласованность с БД
        updatedFile.id = id;
        updatedFile.updateUniqueId();
    });

    updateGalleryFile(updatedFile);
}

export function isFav(url) {
    if (!url || !Favorites) return false;
    const searchUrl = url.toString();
    return Favorites.some(fav => fav.thumbUrl.toString() === searchUrl);
}

export function favToDisplayFile(favData) {
    const {name, url, display, source, tags, remote_type} = favData;
    return GetThumbByData({
        thumbUrl: url,
        remoteType: remote_type,
        tags: tags,
        sourceUrl: source,
        title: name,
        priority: display,
    });
}