const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');

const SETTINGS_OVERRIDE = path.join(process.cwd(), 'data', 'settings.override.json');
const PRIVATE_OVERRIDE  = path.join(process.cwd(), 'data', 'private.override.json');

// Re-require a config module fresh so we return the effective values
// (defaults merged with the current override file).
function freshRequire(relPath) {
    const resolved = require.resolve(relPath);
    delete require.cache[resolved];
    return require(relPath);
}

function register() {
    ipcMain.handle('config:get', () => {
        return {
            settings: { ...freshRequire('../../data/settings') },
            private:  { ...freshRequire('../../data/private') },
        };
    });

    ipcMain.handle('config:save', (_, { settings, private: priv } = {}) => {
        if (settings) {
            fs.writeFileSync(SETTINGS_OVERRIDE, JSON.stringify(settings, null, 2), 'utf8');
        }
        if (priv) {
            fs.writeFileSync(PRIVATE_OVERRIDE, JSON.stringify(priv, null, 2), 'utf8');
        }
        return { ok: true };
    });

    // Settings are read at module load across both processes, so a relaunch is
    // the clean way to apply them everywhere.
    ipcMain.handle('config:relaunch', () => {
        app.relaunch();
        app.exit(0);
    });
}

module.exports = { register };
