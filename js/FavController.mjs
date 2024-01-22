import {BuildThumbBySrc, ClearGallery} from "./thumb.mjs";
import {ForceAddFavImage, ForceAddFavTagAddFavTag, ForceRemoveFav} from './backend.js';
import {SetNavActive} from "./main.js";
import {ToggleTag} from "./r34.js";

$( document ).ready(function() {
    document.getElementById('nav-fav').onclick = DisplayFavorites;
});

function ToggleFav(url, name="", source="", tags="")
{
    if(isFav(url))
        removeFav(url);
    else addFav(url, name, source, tags);
}

function removeFav(url)
{
    if(Favorites == null)
        return false;

    if(!isFav(url)) {
        console.log('error');
        return;
    }

    ForceRemoveFav(url);
}

export function AddFavTag(tag) {
    ForceAddFavTagAddFavTag(tag);
}
function addFav(url, name="", source="", tags="")
{
    if(Favorites == null)
        return false;

    if(isFav(url)) {
        console.log('error');
        return;
    }

    ForceAddFavImage(url, name, source, tags);
}

function isFav(url)
{
    if(Favorites == null)
        return false;

    for(let i = 0; i < Favorites.length; i++)
    {
        let fav = Favorites[i];
        if(fav.url.toString().localeCompare(url.toString()) === 0)
            return true;
    }
    return false;
}

let Favorites = null;
export function OnUpdateFavorites(arr) {
    let f = false;
    if (Favorites == null)
        f = true;
    Favorites = arr;
    if (!f)
        return;

    //gallery.querySelectorAll()
}



let FavTags = null;
export function OnUpdateFavoritesTags(arr) {
    FavTags = arr;
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
    })
}


function DisplayFavorites()
{
    SetNavActive("#nav-fav");

    ClearGallery();

    Favorites.forEach( fav => {
        BuildThumbBySrc(fav.url);
    });
}