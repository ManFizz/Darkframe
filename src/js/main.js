import {DisplayP365} from "./p365.js";

let gallery;

export function InitMain()
{
    gallery = document.querySelector("#gallery");
    document.getElementById('nav-toggle-view').onclick = ToggleView;
    document.getElementById('nav-p365').onclick = DisplayP365;
    document.getElementById('sidebarCollapse').onclick = () => {
        document.querySelector('.sidebar').classList.toggle('open');
        document.getElementById('main-container').classList.toggle('sidebar-open');
    }
}

export function SetNavActive(selector)
{
    let parent = document.querySelectorAll("#parent-nav");
    parent.forEach((node) => {
        node.classList.remove('active');
    });
    document.querySelector(selector).parentNode.classList.add("active");
}

export function ChangeSection(section) {
    let sidebar = document.querySelector('.sidebar');
    section = document.getElementById(section);
    if(!section)
        throw new Error('Invalid section' + section);

    let arr = sidebar.getElementsByTagName('section');
    for(let i = 0; i < arr.length; i++)
        arr[i].hidden = arr[i] !== section;
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