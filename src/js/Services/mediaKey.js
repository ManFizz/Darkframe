import {SOURCE_TYPES} from '@/Constants';

// Source-stable identity of a media file, shared by the view history and the video
// resume positions: { section, key } where section is the source (remoteType) and key
// is `lib:<id>` for library items, the path for folder files, the media URL otherwise.
export function mediaKey(file) {
    if (!file) return null;
    const section = file.remoteType;
    if (section == null) return null;
    // Folder files key on their plain path (what older versions stored as the URL).
    const key = section === SOURCE_TYPES.LIBRARY && file.id
        ? `lib:${file.id}`
        : (file.filePath || file.getUrl?.() || file.thumbUrl);
    return key ? { section, key } : null;
}

export default mediaKey;
