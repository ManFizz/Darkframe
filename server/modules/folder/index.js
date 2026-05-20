const directoryController = require('../../controllers/directoryController');

function registerHandlers() {
    directoryController.registerHandlers();
}

module.exports = { registerHandlers };
