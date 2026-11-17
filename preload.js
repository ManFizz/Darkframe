/**
 * The only bridge between the page and Node / Electron. The window runs with
 * contextIsolation and without nodeIntegration, so nothing loaded into it (a
 * booru post, a crafted tag, a file name) can reach the file system or spawn
 * processes; the page gets exactly what is exposed here as `window.darkframe`.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

// Effective config (defaults + overrides), read once; later changes arrive from
// the settings panel itself (liveConfig.js).
const settings = { ...require('./data/settings') };
const priv     = { ...require('./data/private') };


contextBridge.exposeInMainWorld('darkframe', {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    send:   (channel, ...args) => ipcRenderer.send(channel, ...args),
    // Returns an unsubscribe function (functions can't be compared across the bridge).
    on: (channel, fn) => {
        const wrapped = (_event, ...args) => fn(...args);
        ipcRenderer.on(channel, wrapped);
        return () => ipcRenderer.removeListener(channel, wrapped);
    },

    config: { settings, private: priv },

    sys: {
        homedir:  os.homedir(),
        platform: process.platform,
        electron: process.versions.electron,
    },
    path: {
        sep:        path.sep,
        join:       (...p) => path.join(...p),
        resolve:    (...p) => path.resolve(...p),
        dirname:    (p) => path.dirname(p),
        basename:   (p, ext) => path.basename(p, ext),
        extname:    (p) => path.extname(p),
        isAbsolute: (p) => path.isAbsolute(p),
        parse:      (p) => ({ ...path.parse(p) }),
    },
    fileUrl: (p) => pathToFileURL(p).href,
    isDir: (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
    // Absolute path of a File dropped from the OS (File.path is gone in Electron 32+).
    pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
});
