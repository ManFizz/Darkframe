const Collection = require('./models/Collection');

const FAVORITES_NAME = 'Избранное';

// Each library DB owns exactly one system "Favorites" collection. It's created
// on demand and kept out of the regular collection tree (see getCollections).
async function ensureFavoritesCollection() {
    let fav = await Collection.findOne({ where: { isSystem: true } });
    if (!fav) {
        fav = await Collection.create({
            name: FAVORITES_NAME,
            isSystem: true,
            order: -1,
        });
    }
    return fav;
}

async function getFavoritesCollectionId() {
    const fav = await ensureFavoritesCollection();
    return fav.id;
}

module.exports = { ensureFavoritesCollection, getFavoritesCollectionId, FAVORITES_NAME };
