import {addFav, isFav, removeFav} from "./FavController";
import {WebPInfo} from "webpinfo";
import {openModal} from "./modal";

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

    constructor({ title = '', width = -1, height = -1, sourceUrl = '', thumbUrl = '', tags = [], time = 0}) {
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

        let overlay = document.createElement("div");
        overlay.classList.add("overlay");
        this.buildOverlay(overlay, this);
        el.appendChild(overlay);

        const pseudoElement = document.createElement('div');
        pseudoElement.classList.add('background-overlay');
        pseudoElement.style.backgroundImage = `url(${this.thumbUrl})`;
        el.append(pseudoElement);

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
    
    buildOverlay(overlay) {
        if(this.isFav())  {
            overlay.innerHTML = "<i class=\"bi bi-ban\"></i>";
            overlay.querySelector(".bi-ban").addEventListener("click", (e) => {
                e.stopPropagation();
                removeFav(this);
                this.buildOverlay(overlay);
            });
        }
        else
        {
            overlay.innerHTML = "<i class=\"bi bi-heart-fill\"></i>";
            overlay.querySelector(".bi-heart-fill").addEventListener("click", (e) => {
                e.stopPropagation();
                addFav(this);
                this.buildOverlay(overlay);
            });
        }
    }
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

        setupCheckRatio(img);

        setupResize(img);
    }
}

function setupResize(img) {
    img.onload = async () => {
        console.log("pre end");
        if (img.complete && img.naturalWidth > 0) {
            img.onload = null;

            let anim = await IsAnimated(img.src);
            if(anim === false)
                resizeImage(img);
        }
    };
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
            setupCheckRatio(video);
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
        throw new Error('invalid type object in GetMediaFile: ' + thumbUrl);
}

function setupCheckRatio(display) {
    CheckRatio(display);
    display.addEventListener('load', () => {
        CheckRatio(display);
    });
    display.addEventListener('loadedmetadata', () => {
        CheckRatio(display);
    });
    display.onloadeddata = () => { CheckRatio(display); };
    display.onloadedmetadata = () => { CheckRatio(display); };
    display.onload = () => { CheckRatio(display); };
}

function CheckRatio(display) {
    const width = display.tagName === "VIDEO" ? display.videoWidth : display.naturalWidth;
    const height = display.tagName === "VIDEO" ? display.videoHeight : display.naturalHeight;

    if (width === 0 || height === 0) return;

    const ratio = width * 1.4 / height;
    const maxColumns = 3;
    const maxRows = 3;

    const parent = display.parentElement;
    if (ratio > 1)
        parent.style.gridColumn = "span " + Math.min(Math.round(ratio), maxColumns);
    else if (ratio < 1)
        parent.style.gridRow = "span " + Math.min(Math.round(1 / ratio), maxRows);
}

function resizeImage(originalImage, maxDimension = 1080) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    const naturalWidth = originalImage.naturalWidth;
    const naturalHeight = originalImage.naturalHeight;

    const maxDim = Math.max(naturalWidth, naturalHeight);

    const newWidth = naturalWidth * (maxDimension / maxDim);
    const newHeight = naturalHeight * (maxDimension / maxDim);

    canvas.width = newWidth;
    canvas.height = newHeight;

    context.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

    originalImage.src = canvas.toDataURL('image/webp');
    originalImage.parent.querySelector(".background-overlay").style.backgroundImage = `url(${originalImage.src})`;
}