const { ipcMain } = require('electron');

/**
 * Mouse wheel while dragging. During an HTML5 drag Windows runs its own modal
 * drag loop and the page gets no wheel events at all, so a long list can't be
 * scrolled to the drop target. While the renderer reports a drag in progress, a
 * global low-level mouse hook (uiohook) forwards wheel turns to it; the renderer
 * scrolls whatever is under the cursor.
 *
 * The hook runs only for the duration of a drag and is optional — if the native
 * module can't load, dragging still works with edge auto-scroll.
 */
let hook = null;
let failed = false;
let running = false;
let target = null;   // webContents of the window being dragged over

function ensureHook() {
    if (hook || failed) return hook;
    try {
        hook = require('uiohook-napi').uIOhook;
        hook.on('wheel', (e) => {
            if (!running || !target || target.isDestroyed()) return;
            // rotation > 0 = towards the user (scroll down); amount = lines per notch.
            const px = e.rotation * (e.amount || 3) * 40;
            target.send('drag:wheel', e.direction === 4 ? { dx: px, dy: 0 } : { dx: 0, dy: px });
        });
    } catch (err) {
        failed = true;
        console.warn('[dragWheel] global mouse hook unavailable:', err.message);
    }
    return hook;
}

function start(webContents) {
    target = webContents;
    if (running || !ensureHook()) return;
    try { hook.start(); running = true; }
    catch (err) { failed = true; console.warn('[dragWheel] start failed:', err.message); }
}

function stop() {
    if (!running) return;
    running = false;
    try { hook.stop(); } catch { /* already stopped */ }
}

function register() {
    ipcMain.on('drag:active', (event, active) => (active ? start(event.sender) : stop()));
}

module.exports = { register, stop };
