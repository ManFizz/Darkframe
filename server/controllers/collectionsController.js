const {ipcMain} = require("electron");
const { getCollections, updateCollections } = require("../services/collectionService");

async function handleGetCollections() {
	try {
		return await getCollections();
	} catch (error) {
		console.error('Error fetching collections:', error);
		throw error;
	}
}

async function handleUpdateCollections(event, collections) {
	try {
		await updateCollections(collections);
	} catch (error) {
		console.error("Error updating collections:", error);
	}
}

function registerHandlers() {
	ipcMain.handle("GetCollections", handleGetCollections);
	ipcMain.handle("UpdateCollections", handleUpdateCollections);
}

module.exports = { registerHandlers };