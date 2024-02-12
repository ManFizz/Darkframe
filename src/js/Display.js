import {isFav} from "./FavController";
import {WebPInfo} from "webpinfo";

class DisplayFile {
    title
    width
    height
    sourceUrl
    thumbUrl
    tags
    remote_type = null
    time
    _fav = null

    constructor({ title = '', width = -1, height = -1, sourceUrl = '', thumbUrl = '', tags = [] } = {}, time = 0) {
        this.title = title;
        this.width = width;
        this.height = height;
        this.sourceUrl = sourceUrl;
        this.thumbUrl = thumbUrl || sourceUrl || '';
        this.tags = tags;
        this.time = time;
    }

    GetThumb() {
        let el = document.createElement('div');
        el.classList.add('card');
        el.classList.add('thumb');
        el.classList.add('bg-dark');
        this.ProcessThumb(el);
        return el;
    }

    isFav() {
        if(this._fav === null)
            this._fav = isFav(this.thumbUrl);
        return this._fav;
    }

    // @virtual
    ProcessThumb() {}
}

export class ImageFile extends DisplayFile {
    ProcessThumb = (el) => {
        let img = document.createElement('img');
        img.src = this.thumbUrl

        if(this.width !== -1) img.naturalWidth = this.width
        if(this.height !== -1) img.naturalHeight = this.height

        //try load again only once
        img.onerror = () => {
            let dis = new Image()
            dis.src = img.src
        };

        el.appendChild(img);
        WorkWithRatio(el, img);
    }
}

export class VideoFile extends DisplayFile {

    ProcessThumb = (el) => {
        if (IsVideo(this.thumbUrl)) {
            let video = document.createElement("video");
            video.setAttribute('preload', 'metadata');
            video.autoplay = false;

            let source = document.createElement("source");
            source.src = this.thumbUrl;
            video.appendChild(source);

            video.onerror = () => { //try load again only once
                let vid = document.createElement("video");
                vid.src = video.src;
            };

            el.appendChild(video);
            el.appendChild(VideoFile.GetThumbMarkVideo());
            WorkWithRatio(el, video);
        }
        else if (IsImage(this.thumbUrl))
        {
            let imgF = new ImageFile(this.thumbUrl)
            imgF.ProcessThumb(el);
        }
        else {
            console.error('invalid type object in VideoFile:ProcessThumb ' + this.thumbUrl);
            return null;
        }
    };

    static GetThumbMarkVideo() {
        let mark = document.createElement("i");
        mark.classList.add("bi");
        mark.classList.add("bi-camera-video-fill");
        mark.classList.add("video-mark");
        return mark;
    }
}

export function IsImage(path){
    return path.match(".*(.jpg|.jpeg|.png|.webp|.gif|.jfif).*$");
}


export async function IsAnimated(path) {
    if(path.match(".*(.gif).*$"))
        return true;

    if(path.match(".*(.webp).*$")) {
        const cleanPath = path.replace(/^file:\/\/\//, '');
        return await WebPInfo.isAnimated(cleanPath);
    }

    return false;
}

export function IsVideo(path){
    return path.match(".*(.webm|.mp4|.avi).*$");
}

export function GetMediaFile(thumbUrl, openModalUrl = null, tags = null,
                             sourceUrl = null, title = null, time = null) {
    if(IsImage(thumbUrl)) {
         return new ImageFile({
            sourceUrl: sourceUrl || thumbUrl,
            thumbUrl: thumbUrl,
            tags: tags,
            title: title,
            time: time,
        });
    }
    else if(IsVideo(thumbUrl))
    {
        return new VideoFile({
            sourceUrl: sourceUrl || thumbUrl,
            thumbUrl: thumbUrl,
            tags: tags,
            title: title,
            time: time,
        });
    }
    else
    {
        console.error('invalid type object in GetMediaFile: ' + thumbUrl);
        return null;
    }
}

const isOverflown = ({ clientWidth, clientHeight, scrollWidth, scrollHeight }) => {
    return [scrollHeight > clientHeight, scrollWidth > clientWidth];
}

function CheckRatio(display, parent)
{
    let width, height;
    if(display.tagName === "VIDEO")
    {
        width = display.videoWidth;
        height = display.videoHeight;
    }
    else
    {
        width = display.naturalWidth;
        height = display.naturalHeight;
    }
    if(width === 0 || height === 0)
        return;

    let style = "";
    let ratio = Math.round(width*1.4 / height);
    if (ratio > 1) {
        const columns = 3;
        if(ratio > columns)
            ratio = columns;
        style = "grid-column: span " + ratio;
    }

    ratio = Math.round(height / (width*1.4));
    if (ratio > 1) {
        style += "grid-row: span " + ratio;
    }
    if(isOverflown(parent)[0])
        parent.classList.add('long');
    else
        parent.classList.remove('long');

    parent.style = style;
}

function WorkWithRatio(blockElem, display) {
    CheckRatio(display, blockElem);
    display.addEventListener('load', () => {
        CheckRatio(display, blockElem);
    });
    display.addEventListener('loadedmetadata', () => {
        CheckRatio(display, blockElem);
    });
    display.onloadeddata = () => { CheckRatio(display, blockElem); };
    display.onloadedmetadata = () => { CheckRatio(display, blockElem); };
    display.onload = () => { CheckRatio(display, blockElem); };

}