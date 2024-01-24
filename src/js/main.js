import { ClearGallery, DisplayImagesByPath } from './thumb.mjs';
import {DisplayP365} from "./p365.js";

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

function ChangeSection(section) {
    let sidebar = document.querySelector('.sidebar');
    section = document.getElementById(section);
    if(!section)
        throw new Error('Invalid section' + section);

    let arr = sidebar.getElementsByTagName('section');
    for(let i = 0; i < arr.length; i++)
        arr[i].hidden = arr[i] !== section;

    if(section.id === 'section-folders') {
        DisplayImagesByPath('D:\\Work\\bufer\\locker').then();
    }
}

let incView = 1;
function ToggleView()
{
    const listView = [1, 2, 3];

    listView.forEach(c => {
        gallery.classList.remove('gallery-view-' + c);
    });
    gallery.classList.add('gallery-view-' + listView[incView]);

    incView ++;
    if(incView === listView.length)
        incView = 0;
}