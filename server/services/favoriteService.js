const Favorite = require('../models/favorite');

async function addFavorite(event, url, name, source, tags, display, remoteType) {
	try {
		return await Favorite.create({
			title: name,
			thumbUrl: url,
			sourceUrl: source,
			tags: tags,
			priority: display,
			remoteType: remoteType
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
};
