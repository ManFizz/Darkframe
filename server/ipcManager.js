const favoriteController = require('./controllers/favoriteController');
const directoryController = require('./controllers/directoryController');
const favoriteTagController = require('./controllers/favoriteTagController');
const tagController = require('./controllers/tagController');

function setupIpcHandlers() {
	favoriteController.registerHandlers();
	directoryController.registerHandlers();
	favoriteTagController.registerHandlers();
	tagController.registerHandlers();
}

module.exports = { setupIpcHandlers };
