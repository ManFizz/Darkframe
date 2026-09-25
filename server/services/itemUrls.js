// library:// URLs for an item, with cache-busting versions:
//   original — changes only when the file itself is edited (editedAt), so picking a
//              new video thumbnail doesn't remount/restart a playing <video>
//   thumb    — also changes when a different thumbnail frame is chosen (thumbAt)
function itemUrls(item) {
    const e = item.editedAt || 0;
    const t = item.thumbAt != null ? Math.round(item.thumbAt * 1000) : null;
    const origV  = e ? `?v=${e}` : '';
    const thumbV = e || t != null ? `?v=${e}${t != null ? `-${t}` : ''}` : '';
    return {
        thumbPath:    `library://thumb/${item.id}${thumbV}`,
        originalPath: `library://item/${item.id}${origV}`,
    };
}

module.exports = { itemUrls };
