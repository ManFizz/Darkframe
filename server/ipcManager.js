const favoriteController = require('./controllers/favoriteController');
const directoryController = require('./controllers/directoryController');
const favoriteTagController = require('./controllers/favoriteTagController');
const tagController = require('./controllers/tagController');
const { register } = require('./controllers/libraryController')
require('./models/associations');

function setupIpcHandlers() {
	favoriteController.registerHandlers();
	directoryController.registerHandlers();
	favoriteTagController.registerHandlers();
	tagController.registerHandlers();
	register();
}

module.exports = { setupIpcHandlers };
