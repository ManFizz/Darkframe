import {AddThumbByData, ClearGallery} from "./GalleryController.js";
import Private from "../../data/private";
import {SOURCE_TYPES} from "./Display";

function P365GetVideoByURL(url)
{
    const id = parseInt(url.match(/[^/]+$/));
    const x = new XMLHttpRequest();
    x.overrideMimeType('text/html');
    x.open("GET", url, true);
    x.onreadystatechange = function () {
        if (x.readyState !== 4 || x.status !== 200)
            return;

        let parser = new DOMParser();
        let xmlDoc = parser.parseFromString(x.responseText, "text/html");
        AddThumbByData({
            thumbUrl: xmlDoc.querySelector("head > meta[property='og:image']").content, //P365GetTrailerURL(id),
            remoteType: SOURCE_TYPES.P365,
            contentUrl: xmlDoc.querySelector("head > meta[property='og:video']").content,
        });
    };
    x.send(null);
}

let P365currentDomain = 'wow';
let P365protocol = 'http://';

export function DisplayP365() {
    const url = P365protocol + P365currentDomain + '.porno365.bond/user/' + Private.P365UserId;
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

const currentDomain = 'vidz365.com';
const trailersDomainUrl = "http://trailers.porno365.bond";
const trailersServerN = {};
trailersServerN[0] = 'trailers11';
trailersServerN[1] = 'trailers10';
trailersServerN[2] = 'trailers7';
trailersServerN[3] = 'trailers8';
trailersServerN[4] = 'trailers9';
trailersServerN[5] = 'trailers11';
trailersServerN[6] = 'trailers10';
trailersServerN[7] = 'trailers7';
trailersServerN[8] = 'trailers8';
trailersServerN[9] = 'trailers9';
const protocol = 'https:';

function P365GetTrailerURL(id)
{
    const sId = id + "";
    const trdir = 'trailersz';
    const extension = 'webm'
    let trailerUrl = protocol + '//' + trailersServerN[id % 10] + '.' + currentDomain + '/porno365/'+trdir+'/' + sId[0] + '/' + sId[1] + '/' + id + '.' + extension;
    if (id < 10) {
        trailerUrl = protocol + '//' + trailersServerN[id % 10] + '.' + currentDomain + '/porno365/'+trdir+'/0/' + id + '.' + extension;
    }
    return trailerUrl;
}