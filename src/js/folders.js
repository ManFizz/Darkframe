import {GetFiles} from "./backend";
import {BuildThumbBySrc, ClearGallery} from "./thumb";
import {sortFolderArray} from "./foldersSort";
import {getGallery, updateGallery} from "./AppInitializer";
import {Folder, Return} from "./Display";

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

export function BuildThumbFolder(path, name) {
    let displayList = getGallery();
    if(!displayList)
        displayList = [];

    const folderDisplay = new Folder({
        title: name,
        sourceUrl: path,
        thumbUrl: name,
    });
    displayList.unshift(folderDisplay);

    updateGallery(displayList);
}


export function BuildThumbReturn(path) {
    let displayList = getGallery();
    if(!displayList)
        displayList = [];

    const pathParts = path.split('\\');
    path = pathParts.slice(0, -1).join('\\');
    const name = pathParts[pathParts.length - 2];
    const folderDisplay = new Return({
        title: name,
        sourceUrl: path,
        thumbUrl: name,
    });
    displayList.unshift(folderDisplay);

    updateGallery(displayList);
}