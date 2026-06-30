const { ipcMain } = require('electron');
const { addFavorite, removeFavoriteByPost, listFavoriteItems } = require('../services/favoriteService');

async function handleAddFavorite(_, data) {
    try {
        return await addFavorite(data);
    } catch (error) {
        console.error('Error adding favorite:', error);
        return { ok: false, error: error.message };
    }
}

async function handleRemoveFavorite(_, { postUrl }) {
    try {
        return await removeFavoriteByPost(postUrl);
    } catch (error) {
        console.error('Error removing favorite:', error);
        return { ok: false, error: error.message };
    }
}

async function handleListFavorites() {
    try {
        return await listFavoriteItems();
    } catch (error) {
        console.error('Error listing favorites:', error);
        return [];
    }
}

function registerHandlers() {
    ipcMain.handle('favorites:add', handleAddFavorite);
    ipcMain.handle('favorites:remove', handleRemoveFavorite);
    ipcMain.handle('favorites:list', handleListFavorites);
}

module.exports = { registerHandlers };
