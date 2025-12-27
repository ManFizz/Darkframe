import {GetThumbByData} from "./GalleryController.js";
import {ForceAddFavImage, ForceAddFavTag, ForceRemoveFav} from './backend.js';
import {getGallery, setGallery} from "./AppInitializer";
import {ThumbFile} from "./ThumbFile";

export let Favorites = [];

const refreshUIIfNecessary = () => {
    const currentImages = getGallery();
    if (Array.isArray(currentImages)) {
        const updatedImages = currentImages.map(img => new ThumbFile(img));
        setGallery(updatedImages);
    }
};

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

    const indexToDelete = Favorites.findIndex(fav => fav.id === displayFile.id);

    if (indexToDelete !== -1) {
        Favorites.splice(indexToDelete, 1);

        displayFile._fav = false;

        ForceRemoveFav(displayFile);
        refreshUIIfNecessary();
    }
}

export function addFav(displayFile) {
    if (displayFile.isFav()) throw new Error('addFav :: error');

    displayFile._fav = true;
    Favorites.push(displayFile);

    ForceAddFavImage(displayFile).then(id => {
        displayFile.id = id;
    });

    refreshUIIfNecessary();
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

export function DisplayFavorites() {
    setGallery([...Favorites]);
}