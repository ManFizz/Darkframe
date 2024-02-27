import {FILE_TYPES} from "./Display";

let { createPopper } = require('@popperjs/core');

document.getScroll = function () {
    if (window.scrollX !== undefined) {
        return [scrollX, scrollY];
    } else {
        let sx, sy, d = document,
            r = d.documentElement,
            b = d.body;
        sx = r.scrollLeft || b.scrollLeft || 0;
        sy = r.scrollTop || b.scrollTop || 0;
        return [sx, sy];
    }
}

let dialog;
let progressBar;
let seek;
let popperInstance;
let modalTags;

let seekTooltip;

let timeElapsed;
let duration;
export function InitModal() {
    seekTooltip = document.getElementById('seek-tooltip');
    dialog = document.querySelector("dialog");
    modalTags = document.querySelector("#modal-tags");
    progressBar = document.getElementById('progress-bar');
    seek = document.getElementById('seek');
    timeElapsed = document.getElementById('time-elapsed');
    duration = document.getElementById('duration');

    dialog.scrollTop = 0;
    dialog.scrollLeft = 0;

    popperInstance = createPopper(progressBar, seekTooltip, {
        modifiers: [
            {
                name: 'offset',
                options: {
                    offset: ({ placement, reference, popper }) => {
                        return [off - (popper.width/2), 8];
                    },
                },
            },
        ],
        placement: 'top-start',
    });
}

let activeDialogElement;

function setActiveCurrent() {

    const old = document.querySelector(".modal-active");
    if(old !== null)
        old.classList.remove("modal-active");
    activeDialogElement.classList.add("modal-active");
}

function GetDataFromThumb(link) {
    let img = dialog.querySelector('img');
    let video = dialog.querySelector('video');
    if(!video.paused)
        video.pause();

    const imageList = getImageList();
    let id = parseInt(activeDialogElement.getAttribute("id-list"));
    if(imageList[id].thumbUrl === null)
        throw "wtf";

    let controls = dialog.querySelector('.video-controls');
    if (imageList[id].type === FILE_TYPES.VIDEO || link != null) {
        controls.style.display = "flex";
        if(link != null)
            video.src = link;
        else {
            //thumb = activeDialogElement.querySelector('source');
            //video.src = thumb.src;
            video.src = imageList[id].thumbUrl;
        }

        video.style.display = 'block';
        img.style.display = 'none';
        img.src = "";
        video.load();
        video.play().then();

        video.addEventListener('loadedmetadata', () => {
            initializeVideo(video)
        });
        video.addEventListener('timeupdate', () => {
            updateTimeElapsed(video)
        });
        video.addEventListener('timeupdate', () => {
            updateProgress(video)
        });
    } else {
        //thumb = activeDialogElement.querySelector('img');
        //img.src = thumb.src;

        img.src = imageList[id].thumbUrl;
        img.style.display = 'block';
        video.style.display = 'none';
        video.src = "";
        controls.style.display = "none";
    }

    if(img.naturalHeight !== 0) {
        CalcLongClass(img);
    }
    else {
        img.onloadeddata = () => { CalcLongClass(img) };
        img.onloadedmetadata = () => { CalcLongClass(img) };
        img.onload = () => { CalcLongClass(img) };
    }
}


function formatTime(timeInSeconds) {
    const result = new Date(timeInSeconds * 1000);

    return {
        minutes: result.getMinutes(),
        seconds: result.getSeconds() < 10 ? "0" + result.getSeconds() : result.getSeconds(),
    };
}

function updateProgress(video) {
    seek.value = Math.floor(video.currentTime);
    progressBar.value = Math.floor(video.currentTime);
}

function initializeVideo(video) {
    const videoDuration = Math.round(video.duration);
    seek.setAttribute('max', videoDuration.toString());
    progressBar.setAttribute('max', videoDuration.toString());
    const time = formatTime(videoDuration);
    duration.innerText = `${time.minutes}:${time.seconds}`;
    duration.setAttribute('datetime', `${time.minutes}m ${time.seconds}s`)
}

function updateTimeElapsed(video) {
    const time = formatTime(Math.round(video.currentTime));
    timeElapsed.innerText = `${time.minutes}:${time.seconds}`;
    timeElapsed.setAttribute('datetime', `${time.minutes}m ${time.seconds}s`)
}

let off = 100;

export function updateSeekTooltip(event) {
    const skipTo = Math.round((event.offsetX / event.target.clientWidth) * parseInt(event.target.getAttribute('max'), 10));
    seek.setAttribute('data-seek', skipTo.toString())
    const t = formatTime(skipTo);
    seekTooltip.firstChild.textContent = `${t.minutes}:${t.seconds}`;
    const rect = dialog.querySelector('.video-progress').getBoundingClientRect();
    // seekTooltip.style.left = `${event.pageX - rect.left}px`;
    off = event.pageX - rect.left;
    popperInstance.update();
}

