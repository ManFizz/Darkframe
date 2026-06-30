const { ipcMain, dialog } = require('electron');
const { importFiles, ITEMS_PATH, importDirectory, ensureTag } = require('../services/importService');
const { Item, Tag, ItemTag } = require('../models/associations');
const Collection = require('../models/Collection');
const { Op } = require('sequelize');
const sequelize = require('../database');
const path = require('path');
const fs = require('fs');
const { importFromEagleCsv } = require('../services/eagleImportService');
const { importFromUrl } = require('../services/urlImportService');
const { importFromJson } = require('../services/jsonImportService');
const { getFavoritesCollectionId } = require('../favoritesCollection');

function register() {
    ipcMain.handle('library:importDialog', async (_, { collectionId }) => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: 'Media', extensions: ['jpg','jpeg','png','webp','gif','mp4','webm','avi','mkv','mov'] }
            ]
        });

        if (canceled || !filePaths.length) return { results: [], errors: [] };

        return importFiles({ filePaths, collectionId });
    });

    ipcMain.handle('library:importFiles', async (_, { filePaths, collectionId, tags, sourceUrl }) => {
        return importFiles({ filePaths, collectionId, tags, sourceUrl });
    });

    ipcMain.handle('library:getItems', async (_, params = {}) => {
        const { collectionId, search, rating } = params;
        const isUncategorized = params.hasOwnProperty('collectionId') && collectionId === null;

        const where = {};
        if (params.hasOwnProperty('collectionId')) {
            where.collectionId = collectionId;
        }
        if (search) where.title = { [Op.like]: `%${search}%` };
        if (rating) where.rating = { [Op.gte]: rating };

        const [items, childCollections] = await Promise.all([
            Item.findAll({
                where,
                include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
                order: [['order', 'ASC']],
            }),

            !isUncategorized && params.hasOwnProperty('collectionId')
                ? Collection.findAll({
                    where: { parentId: collectionId },
                    order: [['order', 'ASC']],
                })
                : Promise.resolve([]),
        ]);

        const collectionItems = await Promise.all(
            childCollections.map(async (col) => {
                const count = await Item.count({ where: { collectionId: col.id } });
                return {
                    ...col.toJSON(),
                    itemCount: count,
                    isCollection: true, // маркер
                };
            })
        );

        const plainItems = items.map(item => ({
            ...item.toJSON(),
            tags: item.tags.map(t => t.name),
            thumbPath: `library://thumb/${item.id}`,
            originalPath: `library://item/${item.id}`,
        }));

        return { collections: collectionItems, items: plainItems };
    });

    ipcMain.handle('library:bulkUpdateItems', async (_, { updates }) => {
        await sequelize.transaction(async (t) => {
            for (const { id, data } of updates) {
                const { tags, ...fields } = data;

                if (Object.keys(fields).length > 0) {
                    await Item.update(fields, { where: { id }, transaction: t });
                }

                if (tags !== undefined) {
                    await ItemTag.destroy({ where: { itemId: id }, transaction: t });

                    if (tags.length > 0) {
                        const tagRecords = [];
                        for (const name of tags) {
                            tagRecords.push(await ensureTag(name, t));
                        }
                        await ItemTag.bulkCreate(
                            tagRecords.map(tag => ({ itemId: id, tagId: tag.id })),
                            { transaction: t }
                        );
                    }
                }
            }
        });
        return { ok: true };
    });

    ipcMain.handle('library:updateItem', async (_, { id, data }) => {
        const { tags, ...fields } = data;

        if (Object.keys(fields).length > 0) {
            await Item.update(fields, { where: { id } });
        }

        if (tags !== undefined) {
            await ItemTag.destroy({ where: { itemId: id } });

            if (tags.length > 0) {
                const tagRecords = await Promise.all(
                    tags.map(name => ensureTag(name))
                );
                await ItemTag.bulkCreate(
                    tagRecords.map(tag => ({ itemId: id, tagId: tag.id }))
                );
            }
        }

        return { ok: true };
    });

    ipcMain.handle('library:deleteItem', async (_, { id, deleteFile = false }) => {
        await ItemTag.destroy({ where: { itemId: id } });
        await Item.destroy({ where: { id } });

        if (deleteFile) {
            const itemDir = path.join(ITEMS_PATH, id);

            if (fs.existsSync(itemDir)) {
                const files = fs.readdirSync(itemDir);
                for (const file of files) {
                    const filePath = path.join(itemDir, file);
                    try {
                        fs.chmodSync(filePath, 0o666);
                    } catch {}
                }

                await new Promise(resolve => setTimeout(resolve, 100));

                try {
                    fs.rmSync(itemDir, { recursive: true, force: true });
                } catch (e) {
                    console.warn(`Could not delete ${itemDir}, will retry later:`, e.message);
                }
            }
        }

        return { ok: true };
    });

    ipcMain.handle('library:getCollections', async () => {
        // System collections (e.g. Favorites) live in the same DB but are managed
        // separately, so they never show up in the regular collection tree.
        const collections = await Collection.findAll({
            where: { isSystem: false },
            order: [['order', 'ASC']],
        });

        return await Promise.all(
            collections.map(async (col) => {
                const count = await Item.count({where: {collectionId: col.id}});
                return {...col.toJSON(), itemCount: count};
            })
        );
    });

    ipcMain.handle('library:getStats', async () => {
        const favoritesId = await getFavoritesCollectionId();
        const [total, uncategorized, favoritesCount] = await Promise.all([
            Item.count(),
            Item.count({ where: { collectionId: null } }),
            Item.count({ where: { collectionId: favoritesId } }),
        ]);
        return { total, uncategorized, favoritesId, favoritesCount };
    });

    ipcMain.handle('library:createCollection', async (_, { name, parentId, icon, color }) => {
        return Collection.create({ name, parentId, icon, color });
    });

    ipcMain.handle('library:updateCollection', async (_, { id, data }) => {
        const col = await Collection.findByPk(id);
        if (!col) throw new Error('Collection not found');

        if (data.parentId !== undefined && data.parentId === id) {
            throw new Error('Cannot set collection as its own parent');
        }

        await col.update(data);
        return col.toJSON();
    });

    ipcMain.handle('library:reorderCollections', async (_, { updates }) => {
        await Promise.all(
            updates.map(({ id, order, parentId }) =>
                Collection.update(
                    { order, ...(parentId !== undefined ? { parentId } : {}) },
                    { where: { id } }
                )
            )
        );
        return { ok: true };
    });

    ipcMain.handle('library:deleteCollection', async (_, { id }) => {
        await Collection.destroy({ where: { id } });
        return { ok: true };
    });

    ipcMain.handle('library:searchTags', async (_, { query }) => {
        if (!query || query.length < 1) return [];

        try {
            const tags = await Tag.findAll({
                where: { name: { [Op.like]: `%${query.toLowerCase()}%` } },
                include: [{
                    model: Item,
                    as: 'items',
                    required: true,
                    through: { attributes: [] },
                    attributes: [],
                }],
                attributes: ['id', 'name', 'type'],
                limit: 10,
                order: [['name', 'ASC']],
                subQuery: false, // ← ускоряет запрос с include + limit
            });

            return tags.map(t => ({ name: t.name, type: t.type, value: t.name, label: t.name }));
        } catch (e) {
            console.error('[searchTags] error:', e.message);
            return [];
        }
    });

    ipcMain.handle('library:reorderItems', async (_, { orderedIds }) => {
        await Promise.all(
            orderedIds.map((id, index) =>
                Item.update({ order: index }, { where: { id } })
            )
        );
        return { ok: true };
    });

    ipcMain.handle('library:importDirectoryDialog', async (_, { collectionId }) => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openDirectory', 'multiSelections'],
        });

        if (canceled || !filePaths.length) return { results: [], skipped: [], errors: [] };

        const allResults = { results: [], skipped: [], errors: [] };

        for (const dirPath of filePaths) {
            const result = await importDirectory({ dirPath, collectionId });
            allResults.results.push(...result.results);
            allResults.skipped.push(...result.skipped);
            allResults.errors.push(...result.errors);
        }

        return allResults;
    });

    ipcMain.handle('library:importDirectory', async (_, { dirPath, collectionId }) => {
        return importDirectory({ dirPath, collectionId });
    });

    ipcMain.handle('library:importFromEagle', async (_, { csvPath, collectionId }) => {
        return importFromEagleCsv({ csvPath, collectionId });
    });

    ipcMain.handle('library:importUrl', async (event, { url, collectionId }) => {
        return importFromUrl({
            url,
            collectionId,
            onProgress: (p) => event.sender.send('library:urlImportProgress', p),
        });
    });

    ipcMain.handle('library:importEagleDialog', async (event, { collectionId }) => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'CSV', extensions: ['csv'] }],
        });

        if (canceled || !filePaths.length) return null;

        return importFromEagleCsv({
            csvPath: filePaths[0],
            collectionId,
            webContents: event.sender,
        });
    });

    ipcMain.handle('library:importFromJson', async (event, { jsonPath, collectionId }) => {
        return importFromJson({ jsonPath, collectionId, webContents: event.sender });
    });

    ipcMain.handle('library:importJsonDialog', async (event, { collectionId }) => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'JSON', extensions: ['json'] }],
        });

        if (canceled || !filePaths.length) return null;

        return importFromJson({
            jsonPath: filePaths[0],
            collectionId,
            webContents: event.sender,
        });
    });

    // Generate display.jpg for items that have HEIC originals but no display copy
    ipcMain.handle('library:generateMissingDisplays', async (event) => {
        const { generateHeifDisplay } = require('../services/thumbService');
        const dirs = fs.readdirSync(ITEMS_PATH);
        let fixed = 0, skipped = 0, failed = 0;

        for (const id of dirs) {
            const itemDir = path.join(ITEMS_PATH, id);
            const displayPath = path.join(itemDir, 'display.jpg');
            if (fs.existsSync(displayPath)) { skipped++; continue; }

            // Find original file
            let originalPath = null;
            try {
                const files = fs.readdirSync(itemDir);
                const orig = files.find(f => f.startsWith('original'));
                if (!orig) { skipped++; continue; }
                originalPath = path.join(itemDir, orig);
            } catch { skipped++; continue; }

            // Check magic bytes for HEIF
            try {
                const buf = Buffer.alloc(8);
                const fd = fs.openSync(originalPath, 'r');
                fs.readSync(fd, buf, 0, 8, 0);
                fs.closeSync(fd);
                if (buf.slice(4, 8).toString('ascii') !== 'ftyp') { skipped++; continue; }
            } catch { skipped++; continue; }

            try {
                await generateHeifDisplay(originalPath, displayPath);
                fixed++;
                event.sender.send('library:repairProgress', { fixed, skipped, failed });
            } catch (e) {
                console.error('Failed to generate display for', id, e.message);
                failed++;
            }
        }

        return { fixed, skipped, failed };
    });
}

module.exports = { register };