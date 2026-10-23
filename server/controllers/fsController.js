const { app, ipcMain, net, protocol, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fsBrowser = require('../services/fsBrowser');
const fsThumbs = require('../services/fsThumbs');

const SCHEME = 'fsthumb';
const fs = require('fs');
const crypto = require('crypto');
const ops = require('../services/ffmpegOps');
const { getActive } = require('../libraryRegistry');

const sbDir = () => path.join(app.getPath('userData'), 'cache', 'storyboards');
const sbJobs = new Map();

function librarySource(id) {
    if (!/^[A-Za-z0-9._-]+$/.test(String(id))) return null;
    const dir = path.join(getActive().itemsPath, id);
    try {
        const f = fs.readdirSync(dir).find(x => /^original\./i.test(x));
        return f ? path.join(dir, f) : null;
    } catch { return null; }
}

async function getStoryboard({ itemId, path: filePath }) {
    const src = itemId ? librarySource(itemId) : filePath;
    if (!src || !fs.existsSync(src)) return null;
    const st = fs.statSync(src);
    const key = crypto.createHash('sha1').update(`${path.resolve(src).toLowerCase()}|${st.size}|${Math.floor(st.mtimeMs)}|v1`).digest('hex');
    const jpg = path.join(sbDir(), `${key}.jpg`);
    const meta = `${jpg}.json`;
    if (fs.existsSync(jpg) && fs.existsSync(meta)) {
        return { ...JSON.parse(fs.readFileSync(meta, 'utf8')), url: pathToFileURL(jpg).href };
    }
    if (!sbJobs.has(key)) {
        sbJobs.set(key, (async () => {
            fs.mkdirSync(sbDir(), { recursive: true });
            const tmp = `${jpg}.tmp.jpg`;
            const info = await ops.storyboard(src, tmp);
            fs.renameSync(tmp, jpg);
            fs.writeFileSync(meta, JSON.stringify(info));
            return info;
        })().finally(() => sbJobs.delete(key)));
    }
    const info = await sbJobs.get(key);
    return { ...info, url: pathToFileURL(jpg).href };
}
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

        // fsthumb://v/?p=… — the file as a playable video (.ts → its MP4 twin).
        if (new URL(request.url).hostname === 'v') {
            try {
                const remux = require('../services/remuxCache');
                const out = remux.needsRemux(file) ? await remux.playable(file) : file;
                return require('../fileResponse').fileResponse(out, request.headers.get('range'));
            } catch (e) {
                return new Response(`Не удалось подготовить видео: ${e.message}`, { status: 500 });
            }
        }

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
    ipcMain.handle('media:storyboard', async (_, req) => {
        try { return await getStoryboard(req || {}); }
        catch (e) { console.warn('[storyboard]', e.message); return null; }
    });
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
    // Which files of the open folder are already in the library / copies of each other.
    const folderCheck = require('../services/folderCheck');
    ipcMain.handle('fs:libraryCheck', (event, { files }) => folderCheck.checkFiles(files || [], (p) => {
        if (!event.sender.isDestroyed()) event.sender.send('fs:libraryCheckProgress', p);
    }));
    ipcMain.on('fs:libraryCheckCancel', () => folderCheck.cancel());

    // File operations. Delete = recycle bin only (shell.trashItem).
    const fsOps = require('../services/fsOps');
    ipcMain.handle('fs:rename', (_, { from, name }) => fsOps.rename(from, name));
    ipcMain.handle('fs:mkdir', (_, { dir, name }) => fsOps.mkdir(dir, name));
    ipcMain.handle('fs:move', (_, { paths, dest }) => fsOps.move(paths, dest));
    ipcMain.handle('fs:trash', (_, { paths }) => fsOps.trash(paths, (p) => shell.trashItem(p)));

    ipcMain.handle('fs:open', async (_, { file }) => {
        const err = await shell.openPath(file);
        return err ? { ok: false, error: err } : { ok: true };
    });

    // Trim the thumbnail cache a little after startup (never blocks launch).
    setTimeout(() => fsThumbs.pruneCache(cacheDir()).catch(() => {}), 30000);
    setTimeout(() => require('../services/remuxCache').prune(), 60000);
}

module.exports = { SCHEME, register, registerProtocol };
