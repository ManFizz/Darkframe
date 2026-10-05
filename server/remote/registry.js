const { ipcMain } = require('electron');

/**
 * Every ipcMain handler the controllers register, kept by channel — so the remote
 * (phone / browser) server can call exactly the same code the desktop window
 * reaches over IPC. Installed before the controllers register (ipcManager).
 */
const handlers = new Map();    // channel → (event, ...args) => result
const listeners = new Map();   // channel → [(event, ...args) => void]
let installed = false;

function install() {
    if (installed) return;
    installed = true;
    const handle = ipcMain.handle.bind(ipcMain);
    const removeHandler = ipcMain.removeHandler?.bind(ipcMain);
    const on = ipcMain.on.bind(ipcMain);
    ipcMain.handle = (channel, fn) => { handlers.set(channel, fn); return handle(channel, fn); };
    if (removeHandler) ipcMain.removeHandler = (channel) => { handlers.delete(channel); return removeHandler(channel); };
    ipcMain.on = (channel, fn) => {
        if (!listeners.has(channel)) listeners.set(channel, []);
        listeners.get(channel).push(fn);
        return on(channel, fn);
    };
}

async function invoke(channel, event, args) {
    const fn = handlers.get(channel);
    if (!fn) throw new Error(`Нет такого действия: ${channel}`);
    return fn(event, ...(args || []));
}

function send(channel, event, args) {
    (listeners.get(channel) || []).forEach(fn => { try { fn(event, ...(args || [])); } catch { /* ignore */ } });
}

module.exports = { install, invoke, send, has: (c) => handlers.has(c), channels: () => [...handlers.keys()] };
