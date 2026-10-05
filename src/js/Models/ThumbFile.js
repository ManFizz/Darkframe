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
        this.fileName = data.fileName || null;
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
        this.deletedAt = data.deletedAt || null;
        this.editedAt = data.editedAt || null;
        this.editParams = data.editParams || null;   // JSON string of the last image edit
        this.thumbAt = data.thumbAt ?? null;
        this.duration = data.duration ?? null;
        this.viewCount = data.viewCount ?? 0;          // times opened in the viewer (library)
        this.lastViewedAt = data.lastViewedAt ?? null;
        this.mimeType = data.mimeType || null;
        this.notes = data.notes || null;
        this.filePath = data.filePath || null;     // Folders browser: absolute path on disk
        this.score = data.score ?? null;           // booru posts
        this.remoteRating = data.remoteRating || null;
        // Manga (library item made of pages)
        this.isManga = this.mimeType === 'application/x-darkframe-manga';
        this.pageCount = data.pageCount ?? null;
        this.readPosition = data.readPosition ?? null;   // last read page (0-based, across chapters)
        this.readFinished = !!data.readFinished;

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

    async getSize() {
        if (this.width > 0 && this.height > 0)
            return { width: this.width, height: this.height };

        // Measure the real file: thumbUrl may be a downscaled preview (Folders, boorus).
        const src = this.getUrl();
        if (this.type === FILE_TYPES.IMAGE && src) {
            try {
                const img = await this._loadMeta(src);
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