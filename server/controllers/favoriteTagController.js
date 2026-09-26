const {ipcMain} = require("electron");
const FavoriteTag = require("../models/FavoriteTag");

async function getFavoriteTags() {
	try {
		return await FavoriteTag.findAll({
			order: [['display', 'ASC']],
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
		await FavoriteTag.create({
			tag: tag,
			remote_type: remoteType
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

function registerHandlers() {
	ipcMain.handle("getFavTags", getFavoriteTags);
	ipcMain.handle("AddFavTags", addFavoriteTag);
	ipcMain.handle("RemoveFavTags", removeFavoriteTag);
}

module.exports = { registerHandlers };