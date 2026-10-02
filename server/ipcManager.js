const { registerAll } = require('./modules');
const favoriteController = require('./controllers/favoriteController');
const favoriteTagController = require('./controllers/favoriteTagController');
const tagController = require('./controllers/tagController');
const { register } = require('./controllers/libraryController');
const libraryRegistryController = require('./controllers/libraryRegistryController');
const settingsController = require('./controllers/settingsController');
const apiTokenController = require('./controllers/apiTokenController');
const dragWheelController = require('./controllers/dragWheelController');
const netController = require('./controllers/netController');
const mangaController = require('./controllers/mangaController');
const mangaSourcesController = require('./controllers/mangaSourcesController');
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
	dragWheelController.register();
	netController.register();
	mangaController.register();
	mangaSourcesController.register();
	// Push item changes (counts, API imports) to the renderer.
	installItemHooks();
}

module.exports = { setupIpcHandlers };
