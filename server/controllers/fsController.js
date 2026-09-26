const { app, ipcMain, net, protocol, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fsBrowser = require('../services/fsBrowser');
const fsThumbs = require('../services/fsThumbs');

const SCHEME = 'fsthumb';
const cacheDir = () => path.join(app.getPath('userData'), 'cache', 'fsthumbs');

// fsthumb://t/?p=<encoded absolute path>&w=<width> → cached JPEG thumbnail.
function registerProtocol() {
    protocol.handle(SCHEME, async (request) => {
        let file, width;
        try {
            const url = new URL(request.url);
            file = url.searchParams.get('p');
            width = Number(url.searchParams.get('w')) || undefined;
        } catch {
            return new Response('bad request', { status: 400 });
        }
        if (!file || !path.isAbsolute(file)) return new Response('bad path', { status: 400 });

        const thumb = await fsThumbs.getThumb(file, cacheDir(), width);
        if (!thumb) return new Response('no thumbnail', { status: 404 });
        const res = await net.fetch(pathToFileURL(thumb).toString());
        return new Response(res.body, {
            headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=31536000' },
        });
    });
}

function register() {
    ipcMain.handle('fs:list', (_, { dir }) => {
        try { return { ok: true, ...fsBrowser.listDir(dir) }; }
        catch (e) { return { ok: false, error: e.code === 'ENOENT' ? 'Папка не найдена' : e.code === 'EPERM' || e.code === 'EACCES' ? 'Нет доступа' : e.message }; }
    });
    ipcMain.handle('fs:drives', () => fsBrowser.listDrives());
    ipcMain.handle('fs:info', async (_, { file }) => {
        try { return { ok: true, ...fsBrowser.statFile(file), ...(await fsThumbs.mediaInfo(file)) }; }
        catch (e) { return { ok: false, error: e.message }; }
    });
    ipcMain.handle('fs:reveal', (_, { file }) => { shell.showItemInFolder(file); return { ok: true }; });
    // External links (post pages etc.) open in the system browser — http(s) only.
    ipcMain.handle('shell:openUrl', async (_, { url }) => {
        if (!/^https?:\/\//i.test(String(url || ''))) return { ok: false, error: 'bad url' };
        await shell.openExternal(url);
        return { ok: true };
    });
    ipcMain.handle('fs:open', async (_, { file }) => {
        const err = await shell.openPath(file);
        return err ? { ok: false, error: err } : { ok: true };
    });

    // Trim the thumbnail cache a little after startup (never blocks launch).
    setTimeout(() => fsThumbs.pruneCache(cacheDir()).catch(() => {}), 30000);
}

module.exports = { SCHEME, register, registerProtocol };
