import {GetFiles} from "./backend";
import {GetThumbByData} from "./GalleryController";
import {FILE_TYPES, SOURCE_TYPES} from "./ThumbFile";
import {setGallery} from "./AppInitializer";

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

    const arr = JSON.parse(responseText);

    // noinspection SpellCheckingInspection
    const skippedNames = ['.nomedia', '_gsdata_'];
    let array = [];
    arr.forEach(item => {
        const { name, time, isDir } = item;
        if (skippedNames.includes(name)) {
            return;
        }

        if(isDir) {
            const thumbFile = GetThumbByData({
                type: FILE_TYPES.FOLDER,
                title: name,
                sourceUrl: path,
                thumbUrl: name, //for keys in react
                priority: 1000000,
            });
            if(thumbFile !== null)
                array.push(thumbFile);
            return;
        }

        const thumbFile = GetThumbByData({
            thumbUrl: path + "\\" + name,
            remoteType: SOURCE_TYPES.FOLDER,
            title: name,
            time: time,
            remoteId: name,
        });
        if(thumbFile !== null)
            array.push(thumbFile);
    });

    const pathParts = path.split('\\');
    const newPath = pathParts.slice(0, -1).join('\\');
    const name = pathParts[pathParts.length - 2];
    const thumbFile = GetThumbByData({
        type: FILE_TYPES.RETURN,
        title: name,
        sourceUrl: newPath,
        thumbUrl: name, //for keys in react
        priority: 100000000,
    });
    if(thumbFile !== null)
        array.push(thumbFile);
    setGallery(array);
}