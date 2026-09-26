const { registerAll } = require('./modules');
const favoriteController = require('./controllers/favoriteController');
const favoriteTagController = require('./controllers/favoriteTagController');
const tagController = require('./controllers/tagController');
const { register } = require('./controllers/libraryController');
const libraryRegistryController = require('./controllers/libraryRegistryController');
const settingsController = require('./controllers/settingsController');
const apiTokenController = require('./controllers/apiTokenController');
require('./models/associations');
const { installItemHooks } = require('./services/libraryEvents');

function setupIpcHandlers() {
	registerAll();
	favoriteController.registerHandlers();
	favoriteTagController.registerHandlers();
	tagController.registerHandlers();
	register();
	libraryRegistryController.register();
	settingsController.register();
	apiTokenController.register();
	// Push item changes (counts, API imports) to the renderer.
	installItemHooks();
}

module.exports = { setupIpcHandlers };
