const { ipcMain, dialog } = require('electron');
const { importFiles, ITEMS_PATH } = require('../services/importService');
const { Item, Tag, ItemTag } = require('../models/associations');
const Collection = require('../models/Collection');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const { ensureTag } = require('../services/importService');

function register() {
    ipcMain.handle('library:importDialog', async (_, { collectionId }) => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: 'Media', extensions: ['jpg','jpeg','png','webp','gif','mp4','webm','avi'] }
            ]
        });

        if (canceled || !filePaths.length) return { results: [], errors: [] };

        return importFiles({ filePaths, collectionId });
    });

    ipcMain.handle('library:importFiles', async (_, { filePaths, collectionId, tags, sourceUrl }) => {
        return importFiles({ filePaths, collectionId, tags, sourceUrl });
    });

    ipcMain.handle('library:getItems', async (_, { collectionId, search, tags, rating }) => {
        const where = {};
        if (collectionId !== undefined) where.collectionId = collectionId || null;
        if (search) where.title = { [Op.like]: `%${search}%` };
        if (rating) where.rating = { [Op.gte]: rating };

        const items = await Item.findAll({
            where,
            include: [{
                model: Tag,
                as: 'tags',
                through: { attributes: [] },
                attributes: ['id', 'name', 'type'],
            }],
        });
        tags = tags || [];
        const tagsMap = {};
        tags.forEach(({ itemId, tagName }) => {
            if (!tagsMap[itemId]) tagsMap[itemId] = [];
            tagsMap[itemId].push(tagName);
        });

        return items.map(item => ({
            ...item.toJSON(),
            tags: item.tags.map(t => t.name), // фронт получает массив строк как раньше
            thumbPath: `library://thumb/${item.id}`,
            originalPath: `library://item/${item.id}`,
        }));
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
        return Collection.findAll({ order: [['order', 'ASC']] });
    });

    ipcMain.handle('library:createCollection', async (_, { name, parentId, icon, color }) => {
        return Collection.create({ name, parentId, icon, color });
    });

    ipcMain.handle('library:updateCollection', async (_, { id, data }) => {
        await Collection.update(data, { where: { id } });
        return { ok: true };
    });

    ipcMain.handle('library:deleteCollection', async (_, { id }) => {
        await Collection.destroy({ where: { id } });
        return { ok: true };
    });

    ipcMain.handle('library:searchTags', async (_, { query }) => {
        if (!query || query.length < 1) return [];

        const tags = await Tag.findAll({
            where: {
                name: { [Op.like]: `%${query.toLowerCase()}%` },
            },
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
        });

        return tags.map(t => ({
            name: t.name,
            type: t.type,
            value: t.name,
            label: t.name,
        }));
    });
}

module.exports = { register };