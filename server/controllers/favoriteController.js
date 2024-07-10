const { ipcMain } = require('electron');
const {removeFavorite, getFavorites, addFavorite} = require("../services/favoriteService");
const {downloadFile, deleteFile, findFile} = require("./fileManager");
const path = require('path');

async function updateFavoriteLocalUrl(id, localUrl) {
	try {
		await Favorite.update({ localUrl }, {
			where: { id }
		});
		console.log(`Local URL updated for favorite with ID: ${id}`);
	} catch (error) {
		console.error('Error updating local URL:', error);
		throw error;
	}
}

async function handleAddFavorites(event, url, name, source, tags, display, remoteType) {
	try {
		const newFavorite = await addFavorite(event, url, name, source, tags, display, remoteType);
		if (remoteType !== 1) {
			const localPath = path.join(__dirname, '../../downloads');
			try {
				const localUrl = await downloadFile(url, localPath);
				if (localUrl) {
					await updateFavoriteLocalUrl(newFavorite.id, localUrl);
				}
			} catch (downloadError) {
				console.error('Error downloading file:', downloadError.message);
			}
		}
		return newFavorite.id;
	} catch (error) {
		console.error('Error handling addFavorites:', error);
		throw error;
	}
}

const Favorite = require("../models/Favorite");
async function handleRemoveFavorites(event, url) {
	try {
		const favorite = await Favorite.findOne({
			where: {thumbUrl: url}
		});
		if (favorite && favorite.localUrl) {
			fs.unlink(favorite.localUrl, (err) => {
				if (err) console.error('Ошибка при удалении локального файла:', err);
				else console.log('Локальный файл удален:', favorite.localUrl);
			});
		}
		await removeFavorite(url);
		event.sender.send("removeFavoritesSuccess", await getFavorites(event));
	} catch (error) {
		console.error('Error handling removeFavorites:', error);
		event.sender.send("removeFavoritesError", error.message);
	}
}

async function handleGetFavorites(event) {
	try {
		const favorites = await getFavorites();
		for (let favorite of favorites) {
			if (favorite.localUrl && !fs.existsSync(favorite.localUrl)) {
				console.log(`Файл ${favorite.localUrl} не найден. Начинаем скачивание.`);
				const downloadedPath = await downloadFile(favorite.thumbUrl, favorite.localUrl);
				if (!downloadedPath) {
					console.log(`Не удалось скачать файл: ${favorite.thumbUrl}`);
					favorite.localUrl = null; // Обновляем или очищаем localUrl, если файл не удалось скачать
				} else {
					console.log(`Файл ${favorite.localUrl} успешно скачан.`);
				}
			}
		}
		event.sender.send('getFavorites', favorites);
	} catch (error) {
		console.error('Ошибка при получении избранного:', error);
		event.sender.send('getFavoritesError', error.message);
	}
}

function registerHandlers() {
	ipcMain.handle("addFavorites", handleAddFavorites);
	ipcMain.handle("removeFavorites", handleRemoveFavorites);
	ipcMain.handle('getFavorites', handleGetFavorites);
}

module.exports = { registerHandlers };