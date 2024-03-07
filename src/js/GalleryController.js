import {getGallery, setGallery} from "./AppInitializer";
import {DisplayFile} from "./Display";

export function ClearGallery()
{
    setGallery([]);
}

export function GetThumbByData(data) {
    try {
        return new DisplayFile(data);
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