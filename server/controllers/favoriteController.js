const { ipcMain } = require('electron');
const { removeFavorite, getFavorites, addFavorite } = require("../services/favoriteService");
const { downloadFile } = require("./fileManager");
const Favorite = require("../models/Favorite"); // Переместил наверх
const path = require('path');
const fs = require('fs').promises; // Используем промисы для fs

/**
 * Вспомогательная функция обновления URL
 */
async function updateFavoriteLocalUrl(id, localUrl) {
	try {
		await Favorite.update({ localUrl }, { where: { id } });
	} catch (error) {
		console.error('Error updating local URL:', error);
	}
}

async function handleAddFavorites(event, url, name, source, tags, display, remoteType) {
	try {
		const newFavorite = await addFavorite(event, url, name, source, tags, display, remoteType);
		const favoriteId = newFavorite.id || (newFavorite.dataValues ? newFavorite.dataValues.id : null);

		if (!favoriteId) {
			console.error("Не удалось получить ID созданной записи. Загрузка файла отменена.");
			return null;
		}

		if (remoteType !== 1) {
			const downloadPath = path.join(__dirname, '../../downloads');

			downloadFile(url, downloadPath).then(async (localUrl) => {
				if (localUrl) {
					await updateFavoriteLocalUrl(favoriteId, localUrl);
				}
			}).catch(err => console.error('Background download error:', err.message));
		}

		return favoriteId;
	} catch (error) {
		console.error('Error handling addFavorites:', error);
		throw error;
	}
}

async function handleRemoveFavorites(event, url) {
	try {
		const favorite = await Favorite.findOne({ where: { thumbUrl: url } });

		if (favorite && favorite.localUrl) {
			await fs.unlink(favorite.localUrl).catch(() => {}); // Удаляем файл
		}

		await removeFavorite(url);
		return true; // Подтверждаем успех
	} catch (error) {
		console.error('Error handling removeFavorites:', error);
		throw error;
	}
}

async function handleGetFavorites() {
	try {
		const favorites = await getFavorites();
		return favorites; // ВАЖНО: теперь возвращаем массив напрямую
	} catch (error) {
		console.error('Ошибка при получении избранного:', error);
		throw error;
	}
}

async function downloadMissingFavorites() {
	try {
		const favorites = await getFavorites();
		const downloadPath = path.join(__dirname, '../../downloads');

		for (let favorite of favorites) {
			if (favorite.remoteType === 1 || (favorite.localUrl && (await fs.access(favorite.localUrl).then(() => true).catch(() => false)))) {
				continue;
			}

			console.log(`Скачивание отсутствующего файла: ${favorite.thumbUrl}`);
			const localUrl = await downloadFile(favorite.thumbUrl, downloadPath);
			if (localUrl) await updateFavoriteLocalUrl(favorite.id, localUrl);
		}
	} catch (error) {
		console.error('Ошибка при проверке локальных копий:', error);
	}
}

function registerHandlers() {
	ipcMain.handle("addFavorites", handleAddFavorites);
	ipcMain.handle("removeFavorites", handleRemoveFavorites);
	ipcMain.handle('getFavorites', handleGetFavorites);
}

module.exports = { registerHandlers, downloadMissingFavorites };