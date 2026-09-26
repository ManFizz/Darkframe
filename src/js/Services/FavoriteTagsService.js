import {favoriteTagsApi} from "@/Infrastructure/Ipc";

// Saved tags per booru source ({ tag, remote_type }), shown as quick chips in the
// search sidebar. The main process returns the full list after each change.
let favoriteTags = [];
const listeners = new Set();

const norm = (t) => String(t || '').trim().toLowerCase().replace(/\s+/g, '_');

export const FavoriteTagsService = {
    async init() {
        favoriteTags = await favoriteTagsApi.getAll();
        this._notify();
    },

    getAll() { return favoriteTags; },

    has(tag, remoteType) {
        const t = norm(tag);
        return favoriteTags.some(f => f.tag === t && f.remote_type === remoteType);
    },

    async add(tag, remoteType) {
        const t = norm(tag).replace(/^-/, '');
        if (!t || remoteType == null || this.has(t, remoteType)) return;
        favoriteTags = [...favoriteTags, { tag: t, remote_type: remoteType }];   // optimistic
        this._notify();
        try {
            favoriteTags = await favoriteTagsApi.add(t, remoteType) || favoriteTags;
        } catch (e) {
            favoriteTags = favoriteTags.filter(f => !(f.tag === t && f.remote_type === remoteType));
            console.error('Could not save favourite tag:', e);
        }
        this._notify();
    },

    async remove(tag, remoteType) {
        const before = favoriteTags;
        favoriteTags = favoriteTags.filter(f => !(f.tag === tag && f.remote_type === remoteType));
        this._notify();
        try {
            favoriteTags = await favoriteTagsApi.remove(tag, remoteType) || favoriteTags;
        } catch (e) {
            favoriteTags = before;
            console.error('Could not remove favourite tag:', e);
        }
        this._notify();
    },

    subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
    },

    _notify() {
        listeners.forEach(cb => cb(favoriteTags));
    },
};

export default FavoriteTagsService;
