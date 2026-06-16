import {normalizeTags} from "@controllers/TagsController";
import {FILE_TYPES} from "@/Constants";

const EXT = {
    IMAGE: /\.(jpg|jpeg|png|webp|gif|jfif)$/i,
    VIDEO: /\.(webm|mp4|avi|mkv|mov)$/i,
    GIF: /\.(gif)$/i,
    WEBP: /\.(webp)$/i,
};

export class ThumbFile {
    constructor(data) {
        if (!data) return;

        this.id = data.id || null;
        this.title = data.title || "Untitled";
        this.remoteId = data.remoteId || null;
        this.width = data.width || 0;
        this.height = data.height || 0;
        this.previewUrl = data.previewUrl || data.thumbUrl;
        this.thumbUrl = data.thumbUrl || "";
        this.contentUrl = data.contentUrl || data.thumbUrl;
        this.sourceUrl = data.sourceUrl || "";
        this.tags = normalizeTags(data.tags);
        this.time = data.time || null;
        this.remoteType = data.remoteType || null;
        this.priority = data.priority ?? 1;
        this.localUrl = data.localUrl || null;
        this.createdAt = data.createdAt || null;
        this.order = data.order || null;
        this.rating = data.rating || null;
        this.collectionId = data.collectionId || null;
        this.importedAt = data.importedAt || null;
        this.size = data.size || null;

        this.type = data.type || this._detectType(this.thumbUrl);
        this._meta = data._meta || null;

        this.uniqueId = this._buildUniqueId();
    }

    uniqueId = null;

    _buildUniqueId() {
        return (this.id ||
            (this.remoteId ? `remoteId-${this.remoteId}` : this.thumbUrl)
        )?.toString() || null;
    }

    updateUniqueId() {
        this.uniqueId = this._buildUniqueId();
    }

    isFav() {
        throw new Error("Deprecated");
    }

    ToggleFav() {
        throw new Error("Deprecated");
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
        return this.localUrl || this.contentUrl || this.thumbUrl;
    }

    _detectType(url) {
        if (!url || typeof url !== "string") {
            return FILE_TYPES.IMAGE;
        }

        const cleanUrl = url.toLowerCase().split("?")[0];

        if (EXT.VIDEO.test(cleanUrl)) {
            return FILE_TYPES.VIDEO;
        }

        if (EXT.IMAGE.test(cleanUrl)) {
            return FILE_TYPES.IMAGE;
        }

        return FILE_TYPES.IMAGE;
    }
}