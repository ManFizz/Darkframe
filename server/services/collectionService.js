const Collection = require("../models/Collection");
const CollectionFavorite = require("../models/CollectionFavorite");
const Favorite = require("../models/Favorite");

async function getCollections() {
	try {
		return await Collection.findAll({
			include: [{
				model: CollectionFavorite,
				include: [{
					model: Favorite
				}]
			}],
			raw: true
		});
	} catch (error) {
		console.error('Error fetching collections:', error);
		throw error;
	}
}

async function updateCollections(collections) {
	try {
		await Collection.destroy({
			where: {}
		});
		await CollectionFavorite.destroy({
			where: {}
		});

		for (const collection of collections) {
			const { name, images } = collection;
			const newCollection = await Collection.create({
				name: name
			});
			for (const image of images) {
				const favorite = await Favorite.findByPk(image.id);
				if (favorite) {
					await CollectionFavorite.create({
						CollectionId: newCollection.id,
						FavoriteId: favorite.id
					});
				} else {
					console.log('Error: favorite not found', image.id);
				}
			}
		}
	} catch (error) {
		console.error("Error updating collections:", error);
		throw error;
	}
}

module.exports = {
	getCollections,
	updateCollections,
}