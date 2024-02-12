import {WorkLastTags} from "./r34.js";
import {getImageList} from "./thumb";
import {VideoFile} from "./Display";

let { createPopper } = require('@popperjs/core');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

let pos = { top: 0, left: 0, x: 0, y: 0 };

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

export async function ActivePostNext()
{
    skipToSec(0);
    if (activeDialogElement.nextElementSibling == null)
    {
        if(forceOpenModal)
            return;

        forceOpenModal = true;
        WorkLastTags().then();
        return;
    }

    activeDialogElement = activeDialogElement.nextElementSibling;
    activeDialogElement.scrollIntoView();
    await openModal();
}

export async function ActivePostPrev()
{
    if(activeDialogElement.previousElementSibling == null || activeDialogElement.previousElementSibling.getAttribute("id-list") === null)
        return;

    activeDialogElement = activeDialogElement.previousElementSibling;
    activeDialogElement.scrollIntoView();
    await openModal();

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

    let tags = imageList[id].tags.split(" ");
    tags.forEach(tag => {
        let span = document.createElement("span");
        span.classList.add("badge");
        span.classList.add("bg-primary");
        span.classList.add("m-1");
        span.textContent = tag.toString();
        modalTags.appendChild(span);
    });
}

export async function openModal(elem = null, videoLink = null) {
    if(elem != null)
        activeDialogElement = elem;

    GetDataFromThumb(videoLink);

    document.querySelector('body').style.overflowY = 'hidden';
    if (!dialog.hasAttribute('open'))
        dialog.showModal();

    //dialog.scroll();
    ParseTags(activeDialogElement);
    document.activeElement.blur();
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
    dialog.close();

    let videoModal = dialog.querySelector('video');
    if(!videoModal.paused)
        videoModal.pause();
    dialog.querySelector('video').src = "";
    document.querySelector('body').style.overflowY = 'auto';
}

export function togglePlay() {
    let video = dialog.querySelector('video');
    if (video.paused || video.ended) {
        video.play().then();
        dialog.querySelector(".btn-pause").classList.remove('hidden');
        dialog.querySelector(".btn-play").classList.add('hidden');
    } else {
        video.pause();
        dialog.querySelector(".btn-play").classList.remove('hidden');
        dialog.querySelector(".btn-pause").classList.add('hidden');
    }
}

export function toggleRepeat()
{
    let video = dialog.querySelector('video');
    video.loop = !video.loop;

    dialog.querySelector(".btn-repeat").classList.toggle('hidden');
    dialog.querySelector(".btn-repeat-1").classList.toggle('hidden');
}

export function toggleMuted()
{
    let video = dialog.querySelector('video');
    video.muted = !video.muted;

    dialog.querySelector(".btn-volume").classList.toggle('hidden');
    dialog.querySelector(".btn-mute").classList.toggle('hidden');
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

export function skipAhead(event) {
    const skipTo = event.target.dataset.seek ? event.target.dataset.seek : event.target.value;
    dialog.querySelector('video').currentTime = skipTo;
    progressBar.value = skipTo;
    seek.value = skipTo;
}
export function skipToSec(skipTo)
{
    skipTo = parseInt(skipTo);
    let vid = dialog.querySelector('video');
    if(skipTo < 0)
        skipTo = 0;
    else if(skipTo > vid.duration || skipTo === -1)
        skipTo = vid.duration;

    vid.currentTime = skipTo;
    progressBar.value = skipTo;
    seek.value = skipTo;
}

export function skipSec(seconds)
{
    seconds = parseInt(seconds);
    let vid = dialog.querySelector('video');
    let skipTo = vid.currentTime + seconds;
    if(skipTo < 0)
        skipTo = 0;
    else if(skipTo > vid.duration)
        skipTo = vid.duration;

    vid.currentTime = skipTo;
    progressBar.value = skipTo;
    seek.value = skipTo;
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

