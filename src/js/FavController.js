import {BuildThumbBySrc, ClearGallery} from "./thumb.js";
import {ForceAddFavImage, ForceAddFavTag, ForceRemoveFav} from './backend.js';
import {GetCurrentSource, ToggleTag} from "./r34.js";

let Favorites = null;
export function OnUpdateFavorites(arr) {
    Favorites = arr;
}

let FavTags = null;
export function OnUpdateFavoritesTags(arr) {
    FavTags = arr;
    BuildFavoriteTags();
}

export function AddFavTag(tag, remoteType) {
    ForceAddFavTag(tag, remoteType);
}

export function removeFav(displayFile)
{
    if(displayFile.isFav() !== true)
        throw new Error('removeFav :: error');

    const indexToDelete = Favorites.findIndex(fav =>
        fav.source === displayFile.sourceUrl &&
        fav.remote_type === displayFile.remote_type);

    if (indexToDelete !== -1) {
        Favorites.splice(indexToDelete, 1);
        displayFile._fav = false;
    }
    ForceRemoveFav(displayFile);
}

export function addFav(displayFile)
{
    if(displayFile.isFav() !== false)
        throw new Error('addFav :: error');

    Favorites.push(displayFile);
    displayFile._fav = true;
    ForceAddFavImage(displayFile);
}

export function isFav(url)
{
    if(url == null || Favorites == null)
        return false;

    for(let i = 0; i < Favorites.length; i++)
        if(Favorites[i].url.toString().localeCompare(url.toString()) === 0)
            return true;

    return false;
}

export function BuildFavoriteTags() {
    let tagList = document.getElementById('tags-fav-select') ;
    while (tagList.childNodes.length)
        tagList.childNodes[0].remove();

    let currentRemote = GetCurrentSource().remoteType;

    FavTags.forEach( tag => {
        if(tag.remote_type !== currentRemote)
            return;

        let div = document.createElement('div');
        div.classList.add("btn-group");
        let btn = document.createElement('button');
        btn.type = 'button';
        btn.classList.add('btn');
        btn.classList.add('btn-primary');
        btn.onclick = () => ToggleTag(tag.tag);
        btn.textContent = tag.tag;
        div.appendChild(btn);
        tagList.appendChild(div);
    });
}


export function DisplayFavorites()
{
    ClearGallery();

    Favorites.forEach( fav => {
        BuildThumbBySrc(fav.url, fav.remote_type, null, fav.tags, fav.source, fav.name);
    });
}