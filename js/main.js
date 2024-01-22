import { ClearGallery, BuildThumbBySrc, DisplayImagesByPath } from './thumb.mjs';

$('#sidebarCollapse').on('click', function() {
    $('.sidebar').toggleClass('open');
    $('#main-container').toggleClass('sidebar-open');
});

let gallery = document.querySelector("#gallery");

$( document ).ready(function()
{
    let form = document.querySelector("#path-form");
    form.addEventListener("reset", async () => {
        ClearGallery();
    });

    form.addEventListener("submit", async (e) => {
        let input = form.querySelector("input");
        e.preventDefault();
        let line = input.value;
        input.value = "";
        await DisplayImagesByPath(line);
    });

    document.getElementById('nav-fold').onclick = () => ChangeSection('section-folders');
    document.getElementById('nav-toggle-view').onclick = ToggleView;
    document.getElementById('nav-r34').onclick = () => ChangeSection('section-r34');
    document.getElementById('nav-p365').onclick = DisplayP365;

});


export function SetNavActive(selector)
{
    let parent = document.querySelectorAll("#parent-nav");
    parent.forEach((node) => {
        node.classList.remove('active');
    });
    document.querySelector(selector).parentNode.classList.add("active");
}


let incView = 0;
function ToggleView()
{
    gallery.classList.remove('gallery-view-1');
    gallery.classList.remove('gallery-view-2');
    gallery.classList.remove('gallery-view-3');
    switch(incView % 3)
    {
        case 0: {
            gallery.classList.add('gallery-view-1');
            break;
        }
        case 1: {
            gallery.classList.add('gallery-view-2');
            break;
        }
        case 2: {
            gallery.classList.add('gallery-view-3');
            incView = -1;
            break;
        }
    }
    incView +=1;
}

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
        BuildThumbBySrc(xmlDoc.querySelector("head > meta[property='og:image']").content, xmlDoc.querySelector("head > meta[property='og:video']").content);
    };
    x.send(null);
}


let P365currentDomain = 'wow';
let P365protocol = 'http://'

function DisplayP365() {
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

            SetNavActive("#nav-p365");

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

function ChangeSection(section) {
    let sidebar = document.querySelector('.sidebar');
    section = document.getElementById(section);
    if(!section)
        throw new Error('Invalid section' + section);

    let arr = sidebar.getElementsByTagName('section');
    for(let i = 0; i < arr.length; i++)
        arr[i].hidden = arr[i] !== section;

    if(section.id === 'section-folders') {
        DisplayImagesByPath('D:\\Work\\bufer\\ban\\CloudBan').then();
    }
}