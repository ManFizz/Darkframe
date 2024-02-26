import {AddMedia, InsertTag} from "./r34.js";
import {VideoFile} from "./Display";
import {currentSource} from "./main";

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

let forceOpenModal = false;
let dialog;
let progressBar;
let seek;
let popperInstance;
let modalTags;

export function MaybeForceOpenModal() {
    if(forceOpenModal) {
        openModal(activeDialogElement.nextElementSibling).then();
        forceOpenModal = false;
    }
}

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
    if (imageList[id] instanceof VideoFile || link != null) {
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

function ParseTags() {
    while (modalTags.childNodes.length > 0)
        modalTags.childNodes[0].remove();

    const imageList = getImageList();
    let id = parseInt(activeDialogElement.getAttribute("id-list"));
    if(imageList[id].tags === null || imageList[id].tags.length === 0)
        return;

    //
    let tags = imageList[id].tags.split(" ");
    tags.forEach(tag => {
        let span = document.createElement("span");
        span.classList.add("badge");
        span.classList.add("bg-primary");
        span.classList.add("m-1");
        span.textContent = tag.toString();
        modalTags.appendChild(span);
    });
    if (lastRequestTagsUpdate !== null)
        lastRequestTagsUpdate.abort();

    if(currentSource.remoteType === 4) {
        let stringTags = imageList[id].tags;

        const x = new XMLHttpRequest();
        const url = currentSource.tagsUrl + stringTags;
        x.open("GET", url, true);
        x.onload = function() {
            handleTagsResponse(x.responseText);
            lastRequestTagsUpdate = null;
        };
        x.send();
        lastRequestTagsUpdate = x;
    }
}
let lastRequestTagsUpdate = null;

function handleTagsResponse(responseText) {
    while (modalTags.childNodes.length > 0)
        modalTags.childNodes[0].remove();

    let array = JSON.parse(responseText).tag;
    array.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : b.type - a.type);
    array.forEach(tag => {
        if(tag.type === 6) //Deprecated
            return;

        let span = document.createElement("span");
        span.classList.add("badge");
        span.classList.add("m-1");
        span.classList.add("tag-type-" + tag.type);
        span.textContent = tag.name;
        span.onclick = (e) => {
            e.preventDefault();
            InsertTag(tag.name);
        };
        modalTags.appendChild(span);
    });
}

function CalcLongClass(img)
{
    if (img.naturalHeight / img.naturalWidth > 2.5)
        dialog.classList.add('long');
    else
        dialog.classList.remove('long');
}

export async function closeModal()
{
    const old = document.querySelector(".modal-active");
    if(old !== null)
        old.classList.remove("modal-active");
    dialog.close();

    let videoModal = dialog.querySelector('video');
    if(!videoModal.paused)
        videoModal.pause();
    dialog.querySelector('video').src = "";
    document.querySelector('body').style.overflowY = 'auto';
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

