import {ThumbFile} from "@/Models/ThumbFile";

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