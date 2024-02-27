import {getGallery, updateGallery} from "./AppInitializer";
import {DisplayFile} from "./Display";


export function ClearGallery()
{
    updateGallery([]);
}

export function BuildThumbByData(data){
    let newDisplayFile = null;
    try {
        newDisplayFile = new DisplayFile(data);
    } catch(e) {
        const extArrayForSkip = ['txt', 'log', 'bat'];
        if(!data.thumbUrl.toLowerCase().match(`.*.(${extArrayForSkip.join('|')})$`))
            console.error('invalid type object for display: ' + data.thumbUrl);
    }

    let displayList = getGallery();
    displayList.push(newDisplayFile);
    updateGallery(displayList);
}