const { ipcMain } = require('electron');
const { removeFavorite, getFavorites, addFavorite } = require("../services/favoriteService");
const Favorite = require("../models/Favorite");
const fs = require('fs').promises;
const { queueDownload } = require("../services/downloadService");

const tagsToDb = (tags) =>
	Array.isArray(tags) ? tags.join(' ') : (tags || '');

const tagsFromDb = (tags) =>
	tags ? tags.split(' ').filter(Boolean) : [];

async function handleAddFavorites(event, data) {
	try {
		const newFavorite = await addFavorite(event,
			data.thumbUrl,
			data.title,
			data.sourceUrl,
			tagsToDb(data.tags),
			data.priority,
			data.remoteType
		);
		const id = newFavorite?.id;

		if (!id) return null;

		if (remoteType !== 1) {
			queueDownload({ id, thumbUrl });
		}

		return id;
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
		return true;
	} catch (error) {
		console.error('Error handling removeFavorites:', error);
		throw error;
	}
}

async function handleGetFavorites() {
	try {
		const favorites = await getFavorites();
		return favorites.map(row => ({
			...row,
			tags: tagsFromDb(row.tags),
		}));
	} catch (error) {
		console.error('Ошибка при получении избранного:', error);
		throw error;
	}
}

async function downloadMissingFavorites(queueDownload) {
	try {
		const favorites = await getFavorites();
		for (let favorite of favorites) {
			if (favorite.remoteType === 1) continue;

			const localPath = favorite.localUrl;
			const exists = localPath ? await fs.access(localPath).then(() => true).catch(() => false) : false;

			if (!exists && typeof queueDownload === 'function') {
				const url = favorite.thumbUrl || favorite.url;
				queueDownload({ id: favorite.id, url });
			}
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

module.exports = {
	registerHandlers,
	downloadMissingFavorites
};