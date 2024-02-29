import {isFav} from "./FavController";
import {WebPInfo} from "webpinfo";

export const FILE_TYPES = {
    IMAGE: 1,
    VIDEO: 2,
    FOLDER: 3,
    RETURN: 4
};

export const SOURCE_TYPES = {
    FOLDER: 1,
    R34: 2,
    P365: 3,
    GELBOORU: 4,
    FAVORITE: 5, //NOT FOR FILES
};

export class DisplayFile {
    constructor({
                    title = null,
                    width = null,
                    height = null,
                    thumbUrl = null,
                    contentUrl = null,
                    sourceUrl = null,
                    tags = [],
                    time = null,
                    remoteType = null,
                    type = null,
                    priority = 1,
                    _fav = null,
                    _updateFavStatus = null,
                })
    {
        if(!type) {
            if(IsImage(thumbUrl))
                type = FILE_TYPES.IMAGE;
            else if(IsVideo(thumbUrl))
                type = FILE_TYPES.VIDEO;
            else throw new Error();
        }

        this.title = title;
        this.width = width;
        this.height = height;
        this.thumbUrl = thumbUrl;
        this.contentUrl = contentUrl;
        this.sourceUrl = sourceUrl;
        this.tags = tags;
        this.remoteType = remoteType;
        this.time = time;
        this.type = type;
        this.priority = priority;
        this._fav = _fav;
        this._updateFavStatus = _updateFavStatus;
    }

    isFav() {
        if(this._fav === null)
            this._fav = isFav(this.thumbUrl);

        return this._fav;
    }
}

const imageExtensions = /\.(jpg|jpeg|png|webp|gif|jfif)$/i;
const videoExtensions = /\.(webm|mp4|avi)$/i;
const gifExtension = /\.(gif)$/i;
const webpExtension = /\.(webp)$/i;

export function IsImage(path){
    return imageExtensions.test(path.toLowerCase());
}

export async function IsAnimated(path) {
    if(gifExtension.test(path.toLowerCase()))
        return true;

    if(webpExtension.test(path.toLowerCase())) {
        return await WebPInfo.isAnimated(path.replace(/^file:\/\/\//, ''));
    }

    return false;
}

export function IsVideo(path){
    return videoExtensions.test(path.toLowerCase());
}