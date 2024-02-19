import {BuildThumbBySrc, ClearGallery} from "./thumb.js";

function P365GetVideoByURL(url)
{
    const x = new XMLHttpRequest();
    x.overrideMimeType('text/html');
    x.open("GET", url, true);
    x.onreadystatechange = function () {
        if (x.readyState !== 4 || x.status !== 200)
            return;

        let parser = new DOMParser();
        let xmlDoc = parser.parseFromString(x.responseText, "text/html");
        BuildThumbBySrc(xmlDoc.querySelector("head > meta[property='og:image']").content, 3, xmlDoc.querySelector("head > meta[property='og:video']").content);
    };
    x.send(null);
}


let P365currentDomain = 'wow';
let P365protocol = 'http://'

export function DisplayP365() {
    const url = P365protocol + P365currentDomain + '.porno365.bond/user/176139';
    const x = new XMLHttpRequest();
    x.overrideMimeType('application/xml');
    x.open("GET", url, true);
    x.onreadystatechange = function () {
        if (x.readyState !== 4 || x.status !== 200)
            return;


        let parser = new DOMParser();
        let xmlDoc = parser.parseFromString(x.responseText, "text/html")
        let urls = xmlDoc.querySelectorAll(".video_block a");
        if(urls != null) {
            ClearGallery();

            urls.forEach(link => {
                let l = link.getAttribute('href');
                P365GetVideoByURL(l);
            });
        }
    };
    x.send(null);
}

/*
function P365GetTrailerURL(id)
{
    let trailerUrl = P365protocol + '//' + trailersServerN[n.id % 10] + '.' + P365currentDomain + '/porno365/trailers/' + id[0] + '/' +id[1] + '/' + id + '.webm';
    if (n.id < 10) {
        trailerUrl = P365protocol + '//' + trailersServerN[n.id % 10] + '.' + P365currentDomain + '/porno365/trailers/0/' + id + '.webm';
    }
}*/