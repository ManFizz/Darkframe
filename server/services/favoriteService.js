const Favorite = require('../models/favorite');

async function updateFavoriteLocalUrl(id, localUrl) {
	try {
		await Favorite.update({ localUrl }, { where: { id } });
		return await Favorite.findByPk(id);
	} catch (error) {
		console.error('Error updating local URL:', error);
		throw error;
	}
}

async function addFavorite(event, url, name, source, tags, display, remoteType) {
	try {
		return await Favorite.create({
			title: name,
			thumbUrl: url,
			sourceUrl: source,
			tags: tags,
			priority: display,
			remoteType: remoteType,
			createdAt: new Date().toISOString(),
		});
	} catch (error) {
		console.error('Error adding favorite:', error);
		throw error;
	}
}

async function removeFavorite(url) {
	try {
		await Favorite.destroy({
			where: {
				thumbUrl: url
			}
		});
	} catch (error) {
		console.error('Error removing favorite:', error);
		throw error;
	}
}

async function getFavorites() {
	try {
		return await Favorite.findAll({
			order: [['priority', 'ASC']],
			raw: true
		});
	} catch (error) {
		console.error('Error fetching favorites:', error);
		throw error;
	}
}

module.exports = {
	addFavorite,
	removeFavorite,
	getFavorites,
	updateFavoriteLocalUrl
};
