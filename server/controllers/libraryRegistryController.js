const { ipcMain, dialog } = require('electron');
const registry = require('../libraryRegistry');

function register() {
    ipcMain.handle('library:registry:list', () => ({
        libraries: registry.listLibraries(),
        activeId:  registry.getActive().id,
    }));

    ipcMain.handle('library:registry:pickFolder', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Выберите папку для библиотеки',
            properties: ['openDirectory', 'createDirectory'],
        });
        if (canceled || !filePaths.length) return null;
        return filePaths[0];
    });

    ipcMain.handle('library:registry:add', (_, { name, folderPath }) => {
        return registry.addLibrary({ name, folderPath });
    });

    ipcMain.handle('library:registry:rename', (_, { id, name }) => {
        return registry.renameLibrary(id, name);
    });

    ipcMain.handle('library:registry:remove', (_, { id, deleteFiles }) => {
        return registry.removeLibrary(id, { deleteFiles });
    });

    // Switching happens in place: the main process re-opens the database (see
    // librarySwitch), then the window reloads its UI so no view keeps data of the
    // previous library. No process restart.
    ipcMain.handle('library:registry:switch', async (event, { id }) => {
        const res = await require('../services/librarySwitch').switchLibrary(id);
        if (res.changed) setTimeout(() => { if (!event.sender.isDestroyed()) event.sender.reload(); }, 50);
        return res;
    });
}

module.exports = { register };
