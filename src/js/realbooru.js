import {GetThumbByData} from "./GalleryController";
import {SOURCE_TYPES} from "./Display";
import {setGallery} from "./AppInitializer";
import PrivateData from "../../data/private";

const urlFavs = 'https://realbooru.com/index.php?page=favorites&s=view&id=' + PrivateData.RealBooruId;
const urlThumb = 'https://realbooru.com/index.php?page=post&s=view&id=';

let sources = null;

async function parseThumb(id) {
    try {
        let response = await fetch(urlThumb + id);
        let htmlText = await response.text();
        let parser = new DOMParser();
        let html = parser.parseFromString(htmlText, 'text/html');
        let imgOrVideo = html.querySelector('.imageContainer img') || html.querySelector('.imageContainer video source');
        return imgOrVideo ? imgOrVideo.src : null;
    } catch (error) {
        console.error('Error parsing thumb:', error);
        return null;
    }
}

async function loadUrl(url) {
    try {
        let response = await fetch(url);
        let htmlText = await response.text();
        let parser = new DOMParser();
        let html = parser.parseFromString(htmlText, 'text/html');
        parse(html);
    } catch (error) {
        console.error('Error loading URL:', error);
    }
}

var result = [];
async function endResult() {
    let arr = [];

    await Promise.all(result.map(async (r) => {
        let id = r.querySelector('a').id.replace(/[^+\d]/g, '');
        let src = await parseThumb(id);

        let c = GetThumbByData({
            thumbUrl: src,
            remoteType: SOURCE_TYPES.REALBOORU,
            sourceUrl: urlThumb + id,
        });

        arr.push(c);
    }));
    setGallery(arr);
}

var currentPid = 0;
function parse(html) {
    var r = html.querySelectorAll('.thumb');
    result = [...result, ...r];
    if (r.length >= 50) {
        currentPid += 50;
        loadUrl(urlFavs + '&pid=' + currentPid);
    } else {
        endResult();
    }
}

export function WorkRealBooru() {
    loadUrl(urlFavs);
}
