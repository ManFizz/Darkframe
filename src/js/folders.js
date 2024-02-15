import {GetFiles} from "./backend";
import {BuildThumbBySrc, ClearGallery} from "./thumb";
import {sortFolderArray} from "./foldersSort";

export async function DisplayImagesByPath(path)
{
    let mainContainer = document.querySelector("#main-container");
    let responseText = await GetFiles(path);
    if(responseText == null) {
        let warn = document.createElement('div');
        warn.innerHTML = "<div class=\"alert alert-danger alert-dismissible fade show\">\n" +
            "    <button type=\"button\" class=\"btn-close\" data-bs-dismiss=\"alert\"></button>\n" +
            "    <strong>Error!</strong> Maybe this path doesn't exist\n" +
            "  </div>";
        mainContainer.insertBefore(warn, mainContainer.firstChild);
        return;
    }

    ClearGallery();
    let arr = JSON.parse(responseText);
    const sortedArr = sortFolderArray(arr);

    sortedArr.forEach(item => {
        const { name, time } = item;
        if(name.includes('.nomedia'))
            return;

        if(!name.includes('.')) //is folder (or file without ext TODO check?)
        {
            BuildThumbFolder(path, name);
            return;
        }

        let absPath = path + "\\" + name;
        BuildThumbBySrc(absPath, 1, null, null, null, name, time);
    });
    BuildThumbReturn(path);
}

function GetThumb() {

    let el = document.createElement('div');
    el.classList.add('card');
    el.classList.add('thumb');
    el.classList.add('bg-dark');
    return el;
}

export function BuildThumbFolder(path, name) {
    path = path + '\\' + name;

    let blockElem = GetThumb();
    let img = document.createElement("img");
    img.src = 'images/folder.png';
    blockElem.appendChild(img);

    blockElem.onclick = () => {
        ClearGallery();
        DisplayImagesByPath(path).then();
    };

    let title = document.createElement('p');
    title.classList.add('title');
    title.textContent = name;
    blockElem.appendChild(title);

    const gallery = document.getElementById('gallery');
    gallery.insertBefore(blockElem, gallery.firstElementChild);
}


export function BuildThumbReturn(path) {
    let arr = path.split('\\');
    path = '';
    for(let i = 0; i < arr.length - 2; i++)
        path += arr[i] + '\\';
    path += arr[arr.length - 2];
    let blockElem = GetThumb();

    let img = document.createElement("img");
    img.src = 'images/return.png';
    blockElem.appendChild(img);

    blockElem.onclick = () => {
        ClearGallery();
        DisplayImagesByPath(path).then();
    };
    if(arr.length > 1) {
        let title = document.createElement('p');
        title.classList.add('title');
        title.textContent = arr[arr.length - 2];
        blockElem.appendChild(title);
    }

    gallery.insertBefore(blockElem, gallery.firstElementChild);
}