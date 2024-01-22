class DisplayFile {
    title
    width = -1
    height = -1
    sourceUrl
    thumb

    constructor(u) {
        this.sourceUrl = u
        this.thumbUrl = u
    }

    GetThumb() {
        let el = document.createElement('div');
        el.classList.add('card');
        el.classList.add('thumb');
        el.classList.add('bg-dark');
        this.ProcessThumb(el);
        return el;
    }

    //for override
    ProcessThumb() {}

    setName(n) {
        this.title = n;
    }

    setWidth(w) {
        this.width = w;
    }

    setHeight(w) {
        this.height = w;
    }

    setThumbUrl(u) {
        this.thumbUrl = u;
    }
}

function GetDisplayFile(path) {
    if(path.match(".*(.jpg|.jpeg|.png|.webp|.gif).*$")) {
        display = GetThumbImg(path);
        blockElem.appendChild(display);
    } else if(path.match(".*(.webm|.mp4|.avi).*$")) {
        display = GetThumbVideo(path);
        blockElem.appendChild(display);
        blockElem.appendChild(GetThumbMarkVideo());
    } else {
        console.error('invalid type object: ' + path);
        return null;
    }
}

class ImageFile extends DisplayFile {
    ProcessThumb = (el) => {
        let img = document.createElement('img');
        img.src = this.thumbUrl
        if(this.width !== -1) {
            img.naturalWidth = this.width
            img.naturalHeight = this.height
        }
        img.onerror = () => { //try load again only once
            let dis = new Image()
            dis.src = img.src
        };
        el.appendChild(img)
    }
}

class VideoFile extends  DisplayFile {
    ProcessThumb = (el) => {
        if (this.sourceUrl === this.thumbUrl) {
            let video = document.createElement("video");
            video.setAttribute('preload', 'metadata');
            video.setAttribute("loop","");
            //video.muted = true;
            let source = document.createElement("source");
            source.src = this.sourceUrl;
            video.appendChild(source);
            video.onerror = () => { //try load again only once
                let vid = document.createElement("video");
                vid.src = video.src;
            };
            el.appendChild(video)
        } else {
            //custom thumb => thumb is image
            let imgF = new ImageFile(this.thumbUrl)
            imgF.ProcessThumb(el);
        }
    };

    GetThumbMarkVideo() {
        let mark = document.createElement("i");
        mark.classList.add("bi");
        mark.classList.add("bi-camera-video-fill");
        mark.classList.add("video-mark");
        return mark;
    }
}