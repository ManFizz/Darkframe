import {BuildThumbBySrc, ClearGallery} from "./thumb.js";
import {ForceAddFavImage, ForceAddFavTag, ForceRemoveFav} from './backend.js';
import {SetNavActive} from "./main.js";
import {ToggleTag} from "./r34.js";

let Favorites = null;
export function OnUpdateFavorites(arr) {
    Favorites = arr;
}

let FavTags = null;
export function OnUpdateFavoritesTags(arr) {
    FavTags = arr;
    BuildFavoriteTags();
}

$( document ).ready(function() {
    document.getElementById('nav-fav').onclick = DisplayFavorites;
});

export function AddFavTag(tag) {
    ForceAddFavTag(tag);
}

export function removeFav(displayFile)
{
    if(displayFile.isFav() !== true) {
        console.log('removeFav :: error');
        return;
    }

    ForceRemoveFav(displayFile);
}

export function addFav(displayFile)
{
    if(displayFile.isFav() !== false) {
        console.log('addFav :: error');
        return;
    }

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

function BuildFavoriteTags() {
    let tagList = document.getElementById('tags-fav-select') ;
    while (tagList.childNodes.length)
        tagList.childNodes[0].remove();

    FavTags.forEach( tag => {
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


function DisplayFavorites()
{
    SetNavActive("#nav-fav");

    ClearGallery();

    Favorites.forEach( fav => {
        BuildThumbBySrc(fav.url, -1);
    });
}