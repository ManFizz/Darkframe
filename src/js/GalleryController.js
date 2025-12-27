import {getGallery, setGallery} from "./AppInitializer";
import {ThumbFile} from "./ThumbFile";

export function ClearGallery()
{
    setGallery([]);
}

export function GetThumbByData(data) {
    if (data.thumbUrl && data.thumbUrl.includes('.stfolder'))
        return null;

    try {
        return new ThumbFile(data);
    } catch(e) {
        const extArrayForSkip = ['txt', 'log', 'bat'];
        if(!data.thumbUrl.toLowerCase().match(`.*.(${extArrayForSkip.join('|')})$`))
            console.error('invalid type object for display: ' + data.thumbUrl);
    }
    return null;
}

export function AddThumbByData(data){
    const newDisplayFile = GetThumbByData();
    if(newDisplayFile === null)
        return;

    let displayList = getGallery();
    displayList.push(newDisplayFile);
    setGallery(displayList);
}