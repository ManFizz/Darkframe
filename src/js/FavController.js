import { GetThumbByData } from "./GalleryController.js";
import {ForceAddFavImage, ForceAddFavTag, ForceRemoveFav} from './backend.js';
import { setGallery } from "./AppInitializer";

export let Favorites = [];
export function OnUpdateFavorites(arr) {
    Favorites = [];
    arr.forEach( el => {
        const displayFile = GetThumbByData(el);
        Favorites.push(displayFile);
    });
}

export function AddFavTag(tag, remoteType) {
    ForceAddFavTag(tag, remoteType);
}

export function removeFav(displayFile)
{
    if(displayFile.isFav() !== true)
        throw new Error('removeFav :: error');

    const indexToDelete = Favorites.findIndex(fav =>
        fav.id === displayFile.id);

    if (indexToDelete !== -1) {
        Favorites.splice(indexToDelete, 1);
        displayFile._fav = false;
    } else {
        console.error("not found", displayFile);
    }
    ForceRemoveFav(displayFile);

    if(displayFile._updateFavStatus)
        displayFile._updateFavStatus();

    console.log(Favorites);
}

export function addFav(displayFile)
{
    if(displayFile.isFav() !== false)
        throw new Error('addFav :: error');

    Favorites.push(displayFile);
    displayFile._fav = true;
    ForceAddFavImage(displayFile).then(id => {
        displayFile.id = id;
    });

    if(displayFile._updateFavStatus)
        displayFile._updateFavStatus();
}

export function isFav(url)
{
    if(url == null || Favorites == null)
        return false;

    for(let i = 0; i < Favorites.length; i++)
        if(Favorites[i].thumbUrl.toString().localeCompare(url.toString()) === 0)
            return true;

    return false;
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

export function DisplayFavorites()
{
    let array = [];
    Favorites.forEach( favData => {
        array.push(favData);
    });
    setGallery(array);
}