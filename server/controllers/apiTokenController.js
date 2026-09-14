const { ipcMain } = require('electron');
const apiTokens = require('../apiTokens');

function register() {
    ipcMain.handle('apitokens:config',        ()             => apiTokens.getConfig());
    ipcMain.handle('apitokens:list',          ()             => apiTokens.list());
    ipcMain.handle('apitokens:create',        (_, data)      => apiTokens.create(data || {}));
    ipcMain.handle('apitokens:revoke',        (_, { id })    => apiTokens.revoke(id));
    ipcMain.handle('apitokens:setEnabled',    (_, { id, enabled }) => apiTokens.setEnabled(id, enabled));
    ipcMain.handle('apitokens:setRequireAuth', (_, { value }) => apiTokens.setRequireAuth(value));
}

module.exports = { register };
