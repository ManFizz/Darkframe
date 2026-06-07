const { registerAll } = require('./modules');
const favoriteController = require('./controllers/favoriteController');
const favoriteTagController = require('./controllers/favoriteTagController');
const tagController = require('./controllers/tagController');
const { register } = require('./controllers/libraryController');
const libraryRegistryController = require('./controllers/libraryRegistryController');
require('./models/associations');

function setupIpcHandlers() {
	registerAll();
	favoriteController.registerHandlers();
	favoriteTagController.registerHandlers();
	tagController.registerHandlers();
	register();
	libraryRegistryController.register();
}

module.exports = { setupIpcHandlers };
