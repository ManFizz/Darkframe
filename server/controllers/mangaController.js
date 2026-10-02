const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, BrowserWindow } = require('electron');
const store = require('../services/manga/store');
const convert = require('../services/manga/convert');
const progress = require('../services/manga/progress');
const journal = require('../services/undoJournal');
const { Item } = require('../models/associations');

/**
 * IPC for manga in the library: reading (book + progress), page editing,
 * creating manga from folders / archives / selected images, exporting.
 * Online sources and downloads are in mangaSourcesController.
 */
const winOf = (event) => BrowserWindow.fromWebContents(event.sender);
const created = (label, items) => {
    const ids = items.map(i => i.id);
    journal.recordCreated(ids.length > 1 ? `${label} · ${ids.length}` : label, ids);
    return items;
};

function register() {
    // ─── Reading ─────────────────────────────────────────────────────────────
    ipcMain.handle('manga:book', async (_, { id }) => ({ ...store.bookOf(id), state: await progress.get(id) }));
    ipcMain.handle('manga:saveProgress', (_, { id, ...pos }) => progress.save(id, pos));
    ipcMain.handle('manga:resetProgress', (_, { id }) => progress.reset(id));
    ipcMain.handle('manga:setReading', (_, { id, reading }) => store.setReading(id, reading || {}));
    ipcMain.handle('manga:recent', (_, { limit } = {}) => progress.recent(limit));

    // ─── Page editing ───────────────────────────────────────────────────────
    ipcMain.handle('manga:removePages', (_, { id, files }) => store.removePages(id, files || []));
    ipcMain.handle('manga:restorePages', (_, { id, stored }) => store.restorePages(id, stored || []));
    ipcMain.handle('manga:purgeRemoved', (_, { id }) => store.purgeRemoved(id));
    ipcMain.handle('manga:reorder', (_, { id, orders }) => store.reorderPages(id, orders || []));
    ipcMain.handle('manga:setCover', (_, { id, file }) => store.setCover(id, file));
    ipcMain.handle('manga:renameChapter', (_, { id, chapter, title }) => store.renameChapter(id, chapter, title));
    ipcMain.handle('manga:addPagesDialog', async (event, { id, chapter = null, newChapterTitle = null }) => {
        const { canceled, filePaths } = await dialog.showOpenDialog(winOf(event), {
            title: 'Добавить страницы',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Images', extensions: [...store.IMAGE_EXT].map(e => e.slice(1)) }],
        });
        if (canceled || !filePaths.length) return null;
        return store.addPages(id, filePaths.sort(store.naturalSort), { chapter, newChapterTitle });
    });

    // ─── Creating ───────────────────────────────────────────────────────────
    ipcMain.handle('manga:fromItems', async (_, { ids, title, collectionId, trashOriginals = false }) => {
        // The originals go to the trash in the same step, so one Ctrl+Z undoes both.
        const snap = trashOriginals ? await journal.capture(ids, ['deletedAt'], false) : null;
        const res = await convert.fromItems(ids, { title, collectionId, trashOriginals });
        const now = Math.floor(Date.now() / 1000);
        journal.record('сборка манги', {
            fields: ['deletedAt'], withTags: false,
            rows: [...(snap?.rows || []), { id: res.item.id, values: { deletedAt: now } }],
        });
        return res;
    });

    // Files picked in the Folders browser, in the given order → one manga.
    ipcMain.handle('manga:fromFiles', async (_, { files, title, collectionId = null }) => {
        const item = await store.createManga({ title: title || path.basename(path.dirname(files[0] || '')) || 'Манга', chapters: [{ title: '', files }], collectionId });
        return created('манга из файлов', [item])[0];
    });

    ipcMain.handle('manga:importFolderDialog', async (event, { collectionId = null, mode = 'auto' } = {}) => {
        const { canceled, filePaths } = await dialog.showOpenDialog(winOf(event), {
            title: 'Папка с мангой', properties: ['openDirectory', 'multiSelections'],
        });
        if (canceled || !filePaths.length) return null;
        const items = [];
        for (const dir of filePaths) items.push(...await convert.fromFolder(dir, { mode, collectionId }));
        return created('манга из папки', items);
    });
    ipcMain.handle('manga:importFolder', async (_, { dir, mode = 'auto', collectionId = null }) =>
        created('манга из папки', await convert.fromFolder(dir, { mode, collectionId })));
    ipcMain.handle('manga:planFolder', (_, { dir, mode }) =>
        convert.planFolder(dir, mode).map(p => ({ title: p.title, chapters: p.chapters.map(c => ({ title: c.title, pages: c.files.length })) })));

    ipcMain.handle('manga:importArchiveDialog', async (event, { collectionId = null } = {}) => {
        const { canceled, filePaths } = await dialog.showOpenDialog(winOf(event), {
            title: 'Архивы манги', properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'CBZ / ZIP', extensions: ['cbz', 'zip'] }],
        });
        if (canceled || !filePaths.length) return null;
        return importArchives(filePaths, collectionId);
    });
    ipcMain.handle('manga:importArchives', (_, { files, collectionId = null }) => importArchives(files || [], collectionId));

    // ─── Out ────────────────────────────────────────────────────────────────
    ipcMain.handle('manga:exportCbz', async (event, { id }) => {
        const row = await Item.unscoped().findByPk(id, { raw: true });
        const { canceled, filePath } = await dialog.showSaveDialog(winOf(event), {
            title: 'Сохранить как CBZ',
            defaultPath: `${String(row?.title || 'manga').replace(/[<>:"/\\|?*]/g, '_').slice(0, 120)}.cbz`,
            filters: [{ name: 'CBZ', extensions: ['cbz'] }],
        });
        if (canceled || !filePath) return null;
        return convert.exportCbz(id, filePath);
    });
    ipcMain.handle('manga:exportFolder', async (event, { id }) => {
        const { canceled, filePaths } = await dialog.showOpenDialog(winOf(event), { title: 'Куда сохранить страницы', properties: ['openDirectory', 'createDirectory'] });
        if (canceled || !filePaths.length) return null;
        const row = await Item.unscoped().findByPk(id, { raw: true });
        const dir = path.join(filePaths[0], String(row?.title || 'manga').replace(/[<>:"/\\|?*]/g, '_').slice(0, 120));
        fs.mkdirSync(dir, { recursive: true });
        return convert.exportFolder(id, dir);
    });
    ipcMain.handle('manga:split', async (_, { id }) => {
        const res = await convert.splitToImages(id);
        journal.recordCreated(`разбор манги · ${res.results.length}`, res.results.map(r => r.id));
        return res;
    });
}

async function importArchives(files, collectionId) {
    const items = [], errors = [];
    for (const f of files) {
        try { items.push(await convert.fromArchive(f, { collectionId })); }
        catch (e) { errors.push({ file: path.basename(f), error: e.message }); }
    }
    created('манга из архива', items);
    return { items, errors };
}

module.exports = { register };
