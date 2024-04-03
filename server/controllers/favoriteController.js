const { ipcMain } = require('electron');
const {removeFavorite, getFavorites, addFavorite} = require("../services/favoriteService");

async function handleAddFavorites(event, url, name, source, tags, display, remoteType) {
	try {
		const newFavorite = await addFavorite(event, url, name, source, tags, display, remoteType);
		return newFavorite.id;
	} catch (error) {
		console.error('Error handling addFavorites:', error);
		throw error;
	}
}

async function handleRemoveFavorites(event, url) {
	try {
		await removeFavorite(url);
		event.sender.send("removeFavoritesSuccess", await getFavorites(event));
	} catch (error) {
		console.error('Error handling removeFavorites:', error);
		event.sender.send("removeFavoritesError", error.message); // Отправляем ошибку клиенту, если что-то пошло не так
	}
}

async function handleGetFavorites(event) {
	try {
		const favorites = await getFavorites();
		event.sender.send('getFavorites', favorites);
	} catch (error) {
		event.sender.send('getFavoritesError', error.message);
	}
}

function registerHandlers() {
	ipcMain.handle("addFavorites", handleAddFavorites);
	ipcMain.handle("removeFavorites", handleRemoveFavorites);
	ipcMain.handle('getFavorites', handleGetFavorites);
}

module.exports = { registerHandlers };