const { ipcMain, dialog, app } = require('electron');
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

    // Switching: relaunch the app pointing at the new active library.
    // The Electron process restart is short (~1-2s) and guarantees clean
    // re-initialization of the SQLite connection and all in-memory caches.
    ipcMain.handle('library:registry:switch', (_, { id }) => {
        registry.setActive(id);
        app.relaunch();
        app.exit(0);
    });
}

module.exports = { register };
