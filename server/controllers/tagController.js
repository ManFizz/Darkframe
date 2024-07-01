const {ipcMain} = require("electron");
const {getTags, setTags} = require("../services/tagService");

async function handleGetTags() {
	try {
		return await getTags();
	} catch (error) {
		console.error('Error fetching tags:', error);
		throw error;
	}
}

async function handleSetTags(event, tags) {
	try {
		return await setTags(tags);
	} catch (error) {
		console.error('Error set tags:', error);
		throw error;
	}
}

function registerHandlers() {
	ipcMain.handle("getTags", handleGetTags);
	ipcMain.handle("setTags", handleSetTags);
}

module.exports = { registerHandlers };