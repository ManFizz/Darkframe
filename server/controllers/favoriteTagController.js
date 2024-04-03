const {ipcMain} = require("electron");
const FavoriteTag = require("../models/FavoriteTag");

async function getFavoriteTags(event) {
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
		await FavoriteTag.create({
			tag: tag,
			remote_type: remoteType
		});
		event.sender.send("getFavTags", await getFavoriteTags());
	} catch (error) {
		console.error('Error adding favorite tag:', error);
		throw error;
	}
}

function registerHandlers() {
	ipcMain.handle("getFavTags", getFavoriteTags);
	ipcMain.handle("AddFavTags", addFavoriteTag);
}

module.exports = { registerHandlers };