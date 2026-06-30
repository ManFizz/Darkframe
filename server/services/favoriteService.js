const fs = require('fs');
const path = require('path');
const { Item, Tag, ItemTag } = require('../models/associations');
const { importFile, ITEMS_PATH } = require('./importService');
const { importFromUrl } = require('./urlImportService');
const { getFavoritesCollectionId } = require('../favoritesCollection');

const isRemote = (url) => /^https?:\/\//i.test(url || '');

// Favouriting downloads/copies the media into the library's Favorites collection
// as a normal Item. `postUrl` is the canonical origin we dedupe by (e.g. the post
// page), stored on the Item's sourceUrl.
async function addFavorite({ mediaUrl, postUrl, title, tags = [] }) {
    if (!mediaUrl) return { ok: false, error: 'no media url' };

    const collectionId = await getFavoritesCollectionId();
    const origin = postUrl || mediaUrl;

    // Many CDNs (e.g. rule34) reject hot-linking without a same-site Referer; use
    // the post page's origin when we have one.
    let referer;
    try { if (isRemote(origin)) referer = new URL(origin).origin + '/'; } catch { /* ignore */ }

    let result;
    if (isRemote(mediaUrl)) {
        const wrapped = await importFromUrl({
            url: mediaUrl, collectionId, tags, sourceUrl: origin, title, referer,
        });
        if (wrapped.results?.length) result = { ok: true, item: wrapped.results[0] };
        else if (wrapped.skipped?.length) result = { ok: true, skipped: true };
        else result = { ok: false, error: wrapped.errors?.[0]?.error || 'import failed' };
    } else {
        const r = await importFile({
            filePath: mediaUrl, collectionId, tags,
            sourceUrl: origin,
            overrides: { sourceUrl: origin, title: title || undefined },
        });
        result = r.skipped ? { ok: true, skipped: true } : { ok: true, item: r.item };
    }

    return result;
}

async function removeFavoriteByPost(postUrl) {
    const collectionId = await getFavoritesCollectionId();
    const item = await Item.findOne({ where: { collectionId, sourceUrl: postUrl } });
    if (!item) return { ok: false };

    await ItemTag.destroy({ where: { itemId: item.id } });
    await Item.destroy({ where: { id: item.id } });

    const itemDir = path.join(ITEMS_PATH, item.id);
    try { fs.rmSync(itemDir, { recursive: true, force: true }); }
    catch (e) { console.warn('[favorites] could not remove files for', item.id, e.message); }

    return { ok: true };
}

async function listFavoriteItems() {
    const collectionId = await getFavoritesCollectionId();
    const items = await Item.findAll({
        where: { collectionId },
        include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
        order: [['order', 'ASC']],
    });

    return items.map(item => ({
        ...item.toJSON(),
        tags: item.tags.map(t => t.name),
        thumbPath: `library://thumb/${item.id}`,
        originalPath: `library://item/${item.id}`,
    }));
}

module.exports = { addFavorite, removeFavoriteByPost, listFavoriteItems };
