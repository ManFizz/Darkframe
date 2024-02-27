import PrivateData from "../../data/private";
import {REMOTE_TYPES} from "./Display";

const sources = {
    r34: {
        name: "Rule 34",
        mainUrl: "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index",
        tagUrl: "https://api.rule34.xxx/autocomplete.php?q=",
        sourceUrl: "https://rule34.xxx/index.php?page=post&s=view&id=",
        remoteType: REMOTE_TYPES.R34,
    },
    gelbooru: {
        name: "Gelbooru",
        mainUrl: "https://gelbooru.com/index.php?page=dapi&s=post&q=index" + PrivateData.api_gelbooru,
        tagUrl: "https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1&limit=8&orderby=count" +
            PrivateData.api_gelbooru + "&name_pattern=",
        tagsUrl: "https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1" +
            PrivateData.api_gelbooru + "&names=",
        sourceUrl: "https://gelbooru.com/index.php?page=dapi&s=post&q=index" +
            PrivateData.api_gelbooru + "&id=",
        remoteType: REMOTE_TYPES.GELBOORU,
    }
};

export let currentSource = sources.r34;

export function SetSource(sourceType) {
    if(sourceType === sources.r34.remoteType)
        currentSource = sources.r34;
    else if(sourceType === sources.gelbooru.remoteType)
        currentSource = sources.gelbooru;
    else throw new Error("undefined source: " + name);
}

let gallery;

export let currentSection = "section-r34";

export function ChangeSection(section) {
    currentSection = section;

    let sidebar = document.querySelector('.sidebar');
    let el = document.getElementById(section);
    if(!section)
        console.log('Invalid section' + section);

    let arr = sidebar.getElementsByTagName('section');
    for(let i = 0; i < arr.length; i++)
        arr[i].hidden = arr[i] !== el;
}

let incView = 1;
export function ToggleView()
{
    const listView = [1, 2, 3];

    listView.forEach(c => {
        gallery.classList.remove('gallery-view-' + c);
    });
    gallery.classList.add('gallery-view-' + listView[incView]);

    incView ++;
    if(incView === listView.length)
        incView = 0;
}