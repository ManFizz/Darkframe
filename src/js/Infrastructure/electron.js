/**
 * ipcRenderer-shaped wrapper over the preload bridge (window.darkframe), so the
 * page keeps the familiar `ipcRenderer.invoke / on / removeListener` calls while
 * having no direct access to Electron or Node.
 */
const bridge = window.darkframe;

const subs = new Map();   // handler → Map(channel → unsubscribe)

export const ipcRenderer = {
    invoke: (channel, ...args) => bridge.invoke(channel, ...args),
    send:   (channel, ...args) => bridge.send(channel, ...args),
    on(channel, handler) {
        // Handlers are written as (event, ...args); the bridge passes args only.
        const off = bridge.on(channel, (...args) => handler({}, ...args));
        if (!subs.has(handler)) subs.set(handler, new Map());
        subs.get(handler).set(channel, off);
        return ipcRenderer;
    },
    removeListener(channel, handler) {
        const byChannel = subs.get(handler);
        byChannel?.get(channel)?.();
        byChannel?.delete(channel);
        if (byChannel && !byChannel.size) subs.delete(handler);
        return ipcRenderer;
    },
};

export const webUtils = {
    getPathForFile: (file) => bridge.pathForFile(file),
};

// Node helpers the Folders browser needs (all run in the preload).
export const nodePath = bridge.path;
export const sys = bridge.sys;
export const fileUrl = (p) => bridge.fileUrl(p);
export const isDir = (p) => bridge.isDir(p);

// Running in a browser over the network (phone / tablet), not in the desktop app.
export const isWeb = !!bridge.web;
export const webDevice = bridge.web?.device || null;
// An app file URL (library://, mangaimg://, …) the way this page can load it.
export const appUrl = (u) => (bridge.appUrl ? bridge.appUrl(u) : u);
export const uploadFile = (file, opts) => bridge.upload(file, opts);
