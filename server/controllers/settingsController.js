const { ipcMain } = require('electron');
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
        // Keep this process's copies current too (the renderer applies its own —
        // see liveConfig.js); nothing needs a restart.
        if (settings) Object.assign(require('../../data/settings'), settings);
        if (priv) Object.assign(require('../../data/private'), priv);
        return { ok: true };
    });
}

// One setting changed from the main process (tray menu): persisted like a save
// from the panel, applied to this process at once.
function setSetting(key, value) {
    let cur = {};
    try { cur = JSON.parse(fs.readFileSync(SETTINGS_OVERRIDE, 'utf8')); } catch { /* none yet */ }
    cur[key] = value;
    fs.writeFileSync(SETTINGS_OVERRIDE, JSON.stringify(cur, null, 2), 'utf8');
    require('../../data/settings')[key] = value;
}

module.exports = { register, setSetting };
