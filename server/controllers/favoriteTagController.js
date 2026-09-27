const {ipcMain} = require("electron");
const sequelize = require("../database");
const FavoriteTag = require("../models/FavoriteTag");

// `display` is the user-defined position of a saved tag within its source.
async function getFavoriteTags() {
	try {
		return await FavoriteTag.findAll({
			order: [['display', 'ASC'], ['id', 'ASC']],
			raw: true
		});
	} catch (error) {
		console.error('Error fetching favorite tags:', error);
		throw error;
	}
}

async function addFavoriteTag(event, tag, remoteType) {
	try {
		if (await FavoriteTag.findOne({ where: { tag, remote_type: remoteType } })) return getFavoriteTags();
		// New tags go to the end of their source's list.
		const last = await FavoriteTag.max('display', { where: { remote_type: remoteType } });
		await FavoriteTag.create({
			tag: tag,
			remote_type: remoteType,
			display: (Number(last) || 0) + 1,
		});
		return getFavoriteTags();
	} catch (error) {
		console.error('Error adding favorite tag:', error);
		throw error;
	}
}

async function removeFavoriteTag(event, tag, remoteType) {
	await FavoriteTag.destroy({ where: { tag, remote_type: remoteType } });
	return getFavoriteTags();
}

// Persist a new order: `tags` is the full list of the source's tags, top to bottom.
async function reorderFavoriteTags(event, remoteType, tags) {
	if (!Array.isArray(tags)) return getFavoriteTags();
	await sequelize.transaction(async (t) => {
		for (let i = 0; i < tags.length; i++) {
			await FavoriteTag.update({ display: i + 1 }, { where: { tag: tags[i], remote_type: remoteType }, transaction: t });
		}
	});
	return getFavoriteTags();
}

function registerHandlers() {
	ipcMain.handle("getFavTags", getFavoriteTags);
	ipcMain.handle("AddFavTags", addFavoriteTag);
	ipcMain.handle("RemoveFavTags", removeFavoriteTag);
	ipcMain.handle("ReorderFavTags", reorderFavoriteTags);
}

module.exports = { registerHandlers };
