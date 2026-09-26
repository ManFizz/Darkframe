const fsController = require('../../controllers/fsController');

module.exports = {
    registerHandlers() {
        fsController.register();
    },
};
