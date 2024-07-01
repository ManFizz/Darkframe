const favoriteController = require('./controllers/favoriteController');
const directoryController = require('./controllers/directoryController');
const favoriteTagController = require('./controllers/favoriteTagController');
const collectionsController = require('./controllers/collectionsController');
const tagController = require('./controllers/tagController');

function setupIpcHandlers() {
	favoriteController.registerHandlers();
	directoryController.registerHandlers();
	favoriteTagController.registerHandlers();
	collectionsController.registerHandlers();
	tagController.registerHandlers();
}

module.exports = { setupIpcHandlers };
