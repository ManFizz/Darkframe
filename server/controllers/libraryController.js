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
const { editImage, revertImage } = require('../services/imageEditService');
const tagAdmin = require('../services/tagAdmin');
const { getSmartItems } = require('../services/smartItems');

// When an item's collection changes, drop it at the end of the destination's order
// so the just-moved item is easy to find (last relative to "Порядок"). Mutates
// `fields.order` in place; a no-op when the collection isn't changing.
async function moveToEndOnCollectionChange(id, fields, t) {
    if (!('collectionId' in fields)) return;
    const cur = await Item.unscoped().findByPk(id, { attributes: ['collectionId'], transaction: t });
    if (!cur || cur.collectionId === fields.collectionId) return;
    const maxOrder = await Item.max('order', { where: { collectionId: fields.collectionId }, transaction: t });
    fields.order = (Number.isFinite(maxOrder) ? maxOrder : -1) + 1;
}

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
        const { collectionId, search, rating, trash } = params;
        const isUncategorized = params.hasOwnProperty('collectionId') && collectionId === null;

        // Default scope already hides trashed items; the trash view opts out.
        const itemModel = trash ? Item.unscoped() : Item;

        const where = {};
        if (trash) {
            where.deletedAt = { [Op.ne]: null };   // every trashed item, any collection
        } else if (params.hasOwnProperty('collectionId')) {
            where.collectionId = collectionId;
        }
        if (search) where.title = { [Op.like]: `%${search}%` };
        if (rating) where.rating = { [Op.gte]: rating };

        const [items, childCollections] = await Promise.all([
            itemModel.findAll({
                where,
                include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
                order: [['order', 'ASC']],
            }),

            !trash && !isUncategorized && params.hasOwnProperty('collectionId')
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

        const plainItems = items.map(item => {
            // editedAt cache-busts both URLs after an in-app rotate/crop.
            const v = item.editedAt ? `?v=${item.editedAt}` : '';
            return {
                ...item.toJSON(),
                tags: item.tags.map(t => t.name),
                thumbPath: `library://thumb/${item.id}${v}`,
                originalPath: `library://item/${item.id}${v}`,
            };
        });   // toJSON already carries deletedAt / editedAt through to the client

        return { collections: collectionItems, items: plainItems };
    });

    ipcMain.handle('library:bulkUpdateItems', async (_, { updates }) => {
        await sequelize.transaction(async (t) => {
            for (const { id, data } of updates) {
                const { tags, ...fields } = data;

                await moveToEndOnCollectionChange(id, fields, t);

                if (Object.keys(fields).length > 0) {
                    await Item.unscoped().update(fields, { where: { id }, transaction: t });
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

        // One transaction keeps all writes for a single save on one connection, and
        // tags are created sequentially — parallel findOrCreate INSERTs were racing
        // each other into SQLITE_BUSY, especially when a paste added many tags at once.
        await sequelize.transaction(async (t) => {
            await moveToEndOnCollectionChange(id, fields, t);

            if (Object.keys(fields).length > 0) {
                await Item.unscoped().update(fields, { where: { id }, transaction: t });
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
        });

        return { ok: true };
    });

    // Remove an item's files from disk (best-effort on Windows locks).
    async function purgeItemFiles(id) {
        const itemDir = path.join(ITEMS_PATH, id);
        if (!fs.existsSync(itemDir)) return;

        for (const file of fs.readdirSync(itemDir)) {
            try { fs.chmodSync(path.join(itemDir, file), 0o666); } catch {}
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        try {
            fs.rmSync(itemDir, { recursive: true, force: true });
        } catch (e) {
            console.warn(`Could not delete ${itemDir}, will retry later:`, e.message);
        }
    }

    // Wipe an item for good: tags, DB row, files. Unscoped so it also matches
    // trashed rows (the default scope would exclude them).
    async function hardDeleteItem(id) {
        await ItemTag.destroy({ where: { itemId: id } });
        await Item.unscoped().destroy({ where: { id } });
        await purgeItemFiles(id);
    }

    ipcMain.handle('library:deleteItem', async (_, { id, permanent = false }) => {
        if (permanent) {
            await hardDeleteItem(id);
        } else {
            // Soft delete → trash. Files and tags stay so it can be restored.
            await Item.unscoped().update({ deletedAt: Math.floor(Date.now() / 1000) }, { where: { id } });
        }
        return { ok: true };
    });

    ipcMain.handle('library:editImage', async (_, { id, ...transform }) => {
        return editImage(id, transform);
    });

    ipcMain.handle('library:revertImage', async (_, { id }) => {
        return revertImage(id);
    });

    ipcMain.handle('library:restoreItem', async (_, { id }) => {
        // Unscoped: the row we're restoring is currently trashed.
        await Item.unscoped().update({ deletedAt: null }, { where: { id } });
        return { ok: true };
    });

    ipcMain.handle('library:emptyTrash', async () => {
        const trashed = await Item.scope('onlyTrashed').findAll({ attributes: ['id'] });
        for (const { id } of trashed) {
            await hardDeleteItem(id);
        }
        return { ok: true, removed: trashed.length };
    });

    // ─── Tag manager ──────────────────────────────────────────────────────────
    ipcMain.handle('library:getAllTags',   async ()               => tagAdmin.getAllTags());
    ipcMain.handle('library:renameTag',    async (_, { id, newName }) => tagAdmin.renameTag(id, newName));
    ipcMain.handle('library:mergeTags',    async (_, { sourceId, targetId }) => tagAdmin.mergeTags(sourceId, targetId));
    ipcMain.handle('library:deleteTag',    async (_, { id })       => tagAdmin.deleteTag(id));
    ipcMain.handle('library:getTagRules',  async ()               => tagAdmin.getRules());
    ipcMain.handle('library:addTagRule',   async (_, data)         => tagAdmin.addRule(data));
    ipcMain.handle('library:deleteTagRule', async (_, { id })      => tagAdmin.deleteRule(id));

    // ─── Smart collections ──────────────────────────────────────────────────────
    ipcMain.handle('library:getSmartItems', async (_, { filter }) => getSmartItems(filter || {}));

    ipcMain.handle('library:createSmartCollection', async (_, { name, filter }) => {
        const maxOrder = (await Collection.max('order', { where: { isSystem: false } })) || 0;
        const col = await Collection.create({
            name, isSmart: true, filter: JSON.stringify(filter || {}), order: maxOrder + 1,
        });
        return col.toJSON();
    });

    ipcMain.handle('library:updateSmartFilter', async (_, { id, filter }) => {
        await Collection.update({ filter: JSON.stringify(filter || {}) }, { where: { id } });
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
                const j = col.toJSON();
                let itemCount;
                if (j.isSmart) {
                    let f = {};
                    try { f = JSON.parse(j.filter || '{}'); } catch { /* ignore */ }
                    itemCount = (await getSmartItems(f)).items.length;
                } else {
                    itemCount = await Item.count({ where: { collectionId: col.id } });
                }
                return { ...j, itemCount };
            })
        );
    });

    ipcMain.handle('library:getStats', async () => {
        const favoritesId = await getFavoritesCollectionId();
        const [total, uncategorized, favoritesCount, trashCount] = await Promise.all([
            Item.count(),                                         // default scope: live only
            Item.count({ where: { collectionId: null } }),
            Item.count({ where: { collectionId: favoritesId } }),
            Item.unscoped().count({ where: { deletedAt: { [Op.ne]: null } } }),
        ]);
        return { total, uncategorized, favoritesId, favoritesCount, trashCount };
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
                Item.unscoped().update({ order: index }, { where: { id } })
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