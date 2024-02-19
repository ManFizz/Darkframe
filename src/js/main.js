let gallery;

export function InitMain()
{
    gallery = document.querySelector("#gallery");
    document.getElementById('sidebarCollapse').onclick = () => {
        document.querySelector('.sidebar').classList.toggle('open');
        document.getElementById('main-container').classList.toggle('sidebar-open');
    }
}

export let currentSection = "section-r34";

export function ChangeSection(section) {
    currentSection = section;

    let sidebar = document.querySelector('.sidebar');
    let el = document.getElementById(section);
    if(!section)
        console.log('Invalid section' + section);

    let arr = sidebar.getElementsByTagName('section');
    for(let i = 0; i < arr.length; i++)
        arr[i].hidden = arr[i] !== el;
}

let incView = 1;
export function ToggleView()
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