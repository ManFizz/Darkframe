const { app } = require('electron');

/**
 * Start with Windows. The app starts hidden in the tray (--hidden); the window is
 * created on first open. Unpackaged runs (`electron .`) must pass the app folder
 * as the first argument, or the login item would start a bare Electron shell.
 */
const supported = () => process.platform === 'win32'
    && !process.env.DARKFRAME_SANDBOX && !process.env.DARKFRAME_SMOKE
    && !!app.setLoginItemSettings;

const options = () => ({
    path: process.execPath,
    args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'],
});

/** Brings the system login item in line with the StartWithWindows setting. */
function apply() {
    if (!supported()) return;
    try {
        app.setLoginItemSettings({ openAtLogin: !!require('../../data/settings').StartWithWindows, ...options() });
    } catch (e) {
        console.warn('[autostart]', e.message);
    }
}

module.exports = { apply, supported };
