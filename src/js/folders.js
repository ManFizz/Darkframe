import {GetFiles} from "./backend";
import {BuildThumbByData, ClearGallery} from "./thumb";
import {sortFolderArray} from "./foldersSort";
import {FILE_TYPES, REMOTE_TYPES} from "./Display";

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
            BuildThumbByData({
                type: FILE_TYPES.FOLDER,
                title: name,
                sourceUrl: path,
                thumbUrl: name, //for keys in react
                priority: 1000000,
            });
            return;
        }

        BuildThumbByData({
            thumbUrl: path + "\\" + name,
            remoteType: REMOTE_TYPES.FOLDER,
            title: name,
            time: time,
        });
    });

    const pathParts = path.split('\\');
    const newPath = pathParts.slice(0, -1).join('\\');
    const name = pathParts[pathParts.length - 2];
    BuildThumbByData({
        type: FILE_TYPES.RETURN,
        title: name,
        sourceUrl: newPath,
        thumbUrl: name, //for keys in react
        priority: 100000000,
    });
}