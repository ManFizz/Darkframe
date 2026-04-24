const {ipcMain} = require("electron");
const {setTags, getTagsByNames} = require("../services/tagService");

async function handleSetTags(event, tags) {
	try {
		return await setTags(tags);
	} catch (error) {
		console.error('Error set tags:', error);
		throw error;
	}
}

async function handleGetTagsByNames(event, names) {
	try {
		return await getTagsByNames(names);
	} catch (error) {
		console.error("Error getTagsByNames:", error);
		return [];
	}
}

function registerHandlers() {
	ipcMain.handle("setTags", handleSetTags);
	ipcMain.handle("getTagsByNames", handleGetTagsByNames);
}

module.exports = { registerHandlers };