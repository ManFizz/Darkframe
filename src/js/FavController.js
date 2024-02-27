import {BuildThumbByData, ClearGallery} from "./thumb.js";
import {ForceAddFavImage, ForceAddFavTag, ForceRemoveFav} from './backend.js';
import {ToggleTag} from "./r34.js";
import {currentSource} from "./main";

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
        fav.remoteType === displayFile.remoteType);

    if (indexToDelete !== -1) {
        Favorites.splice(indexToDelete, 1);
        displayFile._fav = false;
    }
    ForceRemoveFav(displayFile);

    if(displayFile._updateFavStatus)
        displayFile._updateFavStatus();
}

export function addFav(displayFile)
{
    if(displayFile.isFav() !== false)
        throw new Error('addFav :: error');

    Favorites.push(displayFile);
    displayFile._fav = true;
    ForceAddFavImage(displayFile);

    if(displayFile._updateFavStatus)
        displayFile._updateFavStatus();
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

    FavTags.forEach( tag => {
        if(tag.remoteType !== currentSource.remoteType)
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
        const {name, url, display, source, tags, remote_type} = fav;
        BuildThumbByData({
            thumbUrl: url,
            remoteType: remote_type,
            tags: tags,
            sourceUrl: source,
            title: name,
            priority: display,
        });
    });
}