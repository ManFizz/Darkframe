import {addFav, isFav, removeFav} from "./FavController";
import {WebPInfo} from "webpinfo";
import {FILE_TYPES} from "./Constants";

const EXT = {
    IMAGE: /\.(jpg|jpeg|png|webp|gif|jfif)$/i,
    VIDEO: /\.(webm|mp4|avi)$/i,
    GIF: /\.(gif)$/i,
    WEBP: /\.(webp)$/i,
};

export class ThumbFile {
    constructor(data) {
        if (!data) return;

        try {
            this.id = data.id || getFavId(this.thumbUrl);
        } catch (e) {
            this.id = data.id || null;
        }
        this.title = data.title || "Untitled";
        this.remoteId = data.remoteId || null;
        this.width = data.width || 0;
        this.height = data.height || 0;
        this.previewUrl = data.previewUrl || data.thumbUrl;
        this.thumbUrl = data.thumbUrl || "";
        this.contentUrl = data.contentUrl || data.thumbUrl;
        this.sourceUrl = data.sourceUrl || "";
        if (Array.isArray(data.tags)) {
            this.tags = data.tags;
        } else if (typeof data.tags === 'string') {
            this.tags = data.tags.trim().split(/\s+/);
        } else {
            this.tags = [];
        }
        this.tags = [...new Set(this.tags.map(t => t.toLowerCase()).filter(t => t !== ""))];
        this.time = data.time || null;
        this.remoteType = data.remoteType || null;
        this.priority = data.priority ?? 1;
        this.collectionsIds = data.collectionsIds || [];
        this.localUrl = data.localUrl || null;
        this.createdAt = data.createdAt || null;

        this._fav = data._fav ?? (this.id ? true : null);

        if (!data.type) {
            if (IsImage(this.thumbUrl)) this.type = FILE_TYPES.IMAGE;
            else if (IsVideo(this.thumbUrl)) this.type = FILE_TYPES.VIDEO;
            else this.type = FILE_TYPES.IMAGE;
        } else {
            this.type = data.type;
        }
        this.updateUniqueId();
    }

    uniqueId = null;

    updateUniqueId() {
        this.uniqueId = (this.id || (this.remoteId ? ("remoteId-" + this.remoteId) : this.thumbUrl))?.toString();

        if(this.uniqueId === null)
            console.warn("UniqueId is null for file:", this);
    }

    _detectType(url) {
        if (!url)
            return FILE_TYPES.IMAGE;

        if (EXT.VIDEO.test(url))
            return FILE_TYPES.VIDEO;

        return FILE_TYPES.IMAGE;
    }

    isFav() {
        if(this.thumbUrl === null)
            throw "thumbUrl is null";
        if (this._fav === null)
            this._fav = isFav(this.thumbUrl);

        return this._fav;
    }

    ToggleFav() {
        this.isFav() ? removeFav(this) : addFav(this);
    }

    async getSize() {
        if (this.width > 0 && this.height > 0)
            return { width: this.width, height: this.height };

        if (this.type === FILE_TYPES.IMAGE && this.thumbUrl) {
            try {
                const img = await this._loadMeta(this.thumbUrl);
                this.width = img.naturalWidth;
                this.height = img.naturalHeight;
                return { width: this.width, height: this.height };
            } catch (e) {
                console.error("Failed to load image meta", e);
            }
        }
        return null;
    }

    _loadMeta(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    getUrl() {
        return this.localUrl || this.thumbUrl;
    }
}

export function IsImage(path) {
    return path ? EXT.IMAGE.test(path) : false;
}

export function IsVideo(path) {
    return path ? EXT.VIDEO.test(path) : false;
}

export async function IsAnimated(path) {
    if (!path) return false;
    if (EXT.GIF.test(path)) return true;
    if (EXT.WEBP.test(path)) {
        try {
            const cleanPath = path.replace(/^file:\/\/\//, '');
            return await WebPInfo.isAnimated(cleanPath);
        } catch {
            return false;
        }
    }
    return false;
}