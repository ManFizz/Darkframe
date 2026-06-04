const folderModule = require('./folder');

function registerAll() {
    folderModule.registerHandlers();
}

module.exports = { registerAll };
