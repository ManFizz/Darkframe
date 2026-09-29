const { ipcMain, dialog, shell } = require('electron');
const { importFiles, itemsPath, importDirectory, ensureTag } = require('../services/importService');
const { Item, Tag, ItemTag } = require('../models/associations');
const Collection = require('../models/Collection');
const { Op } = require('sequelize');
const sequelize = require('../database');
const { withTagNames } = require('../services/itemTags');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { importFromEagleCsv } = require('../services/eagleImportService');
const { importFromUrl } = require('../services/urlImportService');
const { importFromJson } = require('../services/jsonImportService');
const { getFavoritesCollectionId } = require('../favoritesCollection');
const { editImage, revertImage, recompressImage } = require('../services/imageEditService');
const tagAdmin = require('../services/tagAdmin');
const { getSmartItems } = require('../services/smartItems');
const { getDashboard } = require('../services/dashboard');
const { findDuplicates } = require('../services/duplicates');
const similarity = require('../services/similarity');
const maintenance = require('../services/maintenance');
const { itemUrls } = require('../services/itemUrls');
const videoEdit = require('../services/videoEditService');
const videoPositions = require('../services/videoPositions');
const viewHistory = require('../services/viewHistory');

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

// Next free "(N)" title for a duplicate: "cat" → "cat (2)", "cat (2)" → "cat (3)",
// skipping numbers already taken by siblings in the same collection.
function nextDuplicateTitle(title, siblingTitles) {
    const m = String(title || '').match(/^(.*?)\s*\((\d+)\)\s*$/);
    const base = (m ? m[1] : String(title || '')).trim();

    let maxN = 1;   // the plain base counts as copy #1
    for (const t of siblingTitles) {
        const s = String(t || '').trim();
        if (base && s === base) continue;
        const mm = s.match(/^(.*?)\s*\((\d+)\)\s*$/);
        if (mm && mm[1].trim() === base) maxN = Math.max(maxN, parseInt(mm[2], 10));
    }
    const n = maxN + 1;
    return base ? `${base} (${n})` : `(${n})`;
}

// Thumbnails for a collection tile: its own first items, topped up from its
// sub-collections (one level down) when it has fewer than three.
async function collectionPreviews(collectionId, childIds = [], limit = 3) {
    const pick = (ids) => Item.findAll({
        where: { collectionId: ids },
        attributes: ['id', 'editedAt', 'thumbAt'],
        order: [['order', 'ASC']],
        limit,
        raw: true,
    });
    let rows = await pick([collectionId]);
    if (rows.length < limit && childIds.length) rows = rows.concat(await pick(childIds)).slice(0, limit);
    return rows.map(r => itemUrls(r).thumbPath);
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

    ipcMain.handle('library:importFiles', async (_, { filePaths, collectionId, tags, sourceUrl, allowDuplicate = false }) => {
        return importFiles({ filePaths, collectionId, tags, sourceUrl, allowDuplicate });
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
            itemModel.findAll({ where, order: [['order', 'ASC']], raw: true }).then(withTagNames),

            !trash && !isUncategorized && params.hasOwnProperty('collectionId')
                ? Collection.findAll({
                    where: { parentId: collectionId },
                    order: [['order', 'ASC']],
                })
                : Promise.resolve([]),
        ]);

        // Sequential (single SQLite connection); each tile gets its count, how many
        // sub-collections it holds and up to three thumbnails for the folder art.
        const collectionItems = [];
        for (const col of childCollections) {
            const [count, childIds] = await Promise.all([
                Item.count({ where: { collectionId: col.id } }),
                Collection.findAll({ where: { parentId: col.id }, attributes: ['id'], order: [['order', 'ASC']], raw: true }),
            ]);
            collectionItems.push({
                ...col.toJSON(),
                itemCount: count,
                childCount: childIds.length,
                previews: await collectionPreviews(col.id, childIds.map(c => c.id)),
                isCollection: true, // маркер
            });
        }

        // editedAt / thumbAt cache-bust the URLs after an in-app edit (see itemUrls).
        const plainItems = items.map(item => ({ ...item, ...itemUrls(item) }));

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
        const itemDir = path.join(itemsPath(), id);
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

    // Full copy of an item: its files (original + thumb) plus every field and tag,
    // as a new independent item placed right after the source. Lets the user
    // edit/crop one copy without touching the other.
    ipcMain.handle('library:duplicateItem', async (_, { id }) => {
        const src = await Item.unscoped().findByPk(id, {
            include: [{ model: Tag, as: 'tags', through: { attributes: [] } }],
        });
        if (!src) throw new Error('Элемент не найден');

        const srcDir = path.join(itemsPath(), src.id);
        const files = fs.existsSync(srcDir) ? fs.readdirSync(srcDir) : [];
        if (!files.length) throw new Error('Файлы элемента не найдены');

        const newId  = crypto.randomUUID();
        const dstDir = path.join(itemsPath(), newId);
        fs.mkdirSync(dstDir, { recursive: true });

        try {
            for (const f of files) {
                fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
            }

            const s = src.toJSON();

            // Sibling titles in the same collection → next free "(N)" title.
            const sibTitles = await Item.unscoped().findAll({
                where: { collectionId: s.collectionId, deletedAt: null },
                attributes: ['title'],
            });
            const newTitle = nextDuplicateTitle(s.title, sibTitles.map(r => r.title));

            const created = await sequelize.transaction(async (t) => {
                // Current display order of the collection's live items.
                const sibs = await Item.unscoped().findAll({
                    where: { collectionId: s.collectionId, deletedAt: null },
                    attributes: ['id'],
                    order: [['order', 'ASC']],
                    transaction: t,
                });

                const ids = sibs.map(r => r.id);
                const at  = ids.indexOf(src.id);
                const insertPos = at === -1 ? ids.length : at + 1;
                ids.splice(insertPos, 0, newId);   // drop the copy right after the source

                const item = await Item.create({
                    id: newId,
                    fileName:   s.fileName,
                    title:      newTitle,
                    sourceUrl:  s.sourceUrl,
                    notes:      s.notes,
                    rating:     s.rating,
                    width:      s.width,
                    height:     s.height,
                    size:       s.size,
                    mimeType:   s.mimeType,
                    duration:   s.duration,
                    collectionId: s.collectionId,
                    fileHash:   s.fileHash,
                    importedAt: Math.floor(Date.now() / 1000),
                    createdAt:  s.createdAt,
                    editedAt:   s.editedAt,
                    order:      insertPos,
                    deletedAt:  null,
                }, { transaction: t });

                if (src.tags?.length) {
                    await ItemTag.bulkCreate(
                        src.tags.map(tag => ({ itemId: newId, tagId: tag.id })),
                        { transaction: t },
                    );
                }

                // Renumber the whole sequence so orders are contiguous and the copy
                // stays put (many collections import with every order = 0, so a plain
                // "shift the tail" wouldn't be enough to place it after the source).
                for (let idx = 0; idx < ids.length; idx++) {
                    await Item.unscoped().update(
                        { order: idx }, { where: { id: ids[idx] }, transaction: t },
                    );
                }

                return item;
            });

            return { ok: true, id: created.id };
        } catch (e) {
            // Row couldn't be created — don't leave orphaned copied files behind.
            fs.rmSync(dstDir, { recursive: true, force: true });
            throw e;
        }
    });

    ipcMain.handle('library:editImage', async (_, { id, ...transform }) => {
        return editImage(id, transform);
    });

    ipcMain.handle('library:revertImage', async (_, { id }) => {
        return revertImage(id);
    });

    // New output settings (format / quality / max side), keeping the item's edits.
    ipcMain.handle('library:recompressImage', async (_, { id, output }) => recompressImage(id, output));

    // ─── Video editing (trim / revert) ─────────────────────────────────────────
    ipcMain.handle('library:trimVideo', async (event, { id, start, end, mode, backup }) => {
        return videoEdit.trimVideo(id, { start, end, mode, backup }, (percent) => {
            if (!event.sender.isDestroyed()) event.sender.send('library:videoEditProgress', { id, percent });
        });
    });

    ipcMain.handle('library:revertVideo', async (_, { id }) => videoEdit.revertVideo(id));

    ipcMain.handle('library:captureVideoFrame', async (_, p) => videoEdit.captureVideoFrame(p || {}));

    ipcMain.handle('library:setVideoThumb', async (_, { id, time }) => videoEdit.setVideoThumb(id, time));

    // ─── Resume positions for long videos ─────────────────────────────────────
    ipcMain.handle('library:getVideoPosition',  async (_, p) => videoPositions.getPosition(p || {}));
    ipcMain.handle('library:saveVideoPosition', async (_, p) => videoPositions.savePosition(p || {}));

    ipcMain.handle('library:restoreItems', async (_, { ids = [] }) => {
        if (!ids.length) return { ok: true, count: 0 };
        await Item.unscoped().update({ deletedAt: null }, { where: { id: { [Op.in]: ids } } });
        return { ok: true, count: ids.length };
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
    ipcMain.handle('library:setTagPinned', async (_, { id, pinned }) => tagAdmin.setPinned(id, pinned));
    ipcMain.handle('library:getPinnedTags', async ()              => tagAdmin.getPinned());
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

        // One grouped count for every regular collection instead of a query each.
        const counts = new Map(
            (await Item.findAll({
                attributes: ['collectionId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
                where: { collectionId: { [Op.ne]: null } },
                group: ['collectionId'],
                raw: true,
            })).map(r => [r.collectionId, Number(r.n)])
        );

        const out = [];
        for (const col of collections) {
            const j = col.toJSON();
            let itemCount;
            if (j.isSmart) {
                let f = {};
                try { f = JSON.parse(j.filter || '{}'); } catch { /* ignore */ }
                itemCount = (await getSmartItems(f)).items.length;
            } else {
                itemCount = counts.get(j.id) || 0;
            }
            out.push({ ...j, itemCount });
        }
        return out;
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

    ipcMain.handle('library:getDashboard', async () => getDashboard());

    // Show the item's file in the OS file manager (the renderer only knows its
    // library:// URL, not the on-disk path).
    ipcMain.handle('library:revealItem', async (_, { id }) => {
        if (!/^[A-Za-z0-9._-]+$/.test(String(id || ''))) return { ok: false };
        const dir = path.join(itemsPath(), id);
        let target = dir;
        try {
            const f = fs.readdirSync(dir).find(x => /^original\./i.test(x));
            if (f) target = path.join(dir, f);
        } catch { return { ok: false }; }
        shell.showItemInFolder(target);
        return { ok: true };
    });

    ipcMain.handle('library:findDuplicates', async () => findDuplicates());

    // ─── Near-duplicates (perceptual hash) ────────────────────────────────────
    ipcMain.handle('library:phashStatus', async () => similarity.phashStatus());
    ipcMain.handle('library:computePhashes', async (event) => similarity.computeMissing((p) => {
        if (!event.sender.isDestroyed()) event.sender.send('library:phashProgress', p);
    }));
    // Watched folders (auto import of new files)
    const watchFolders = require('../services/watchFolders');
    ipcMain.handle('watch:list',   () => watchFolders.list());
    ipcMain.handle('watch:save',   (_, { folder }) => watchFolders.save(folder));
    ipcMain.handle('watch:remove', (_, { id }) => watchFolders.remove(id));
    ipcMain.handle('watch:importExisting', (_, { id }) => watchFolders.importExisting(id));
    ipcMain.handle('watch:pickDir', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        return canceled || !filePaths.length ? null : filePaths[0];
    });

    // Import rules (auto tags / collection / rating)
    const autoRules = require('../services/autoRules');
    ipcMain.handle('autoRules:list',   () => autoRules.list());
    ipcMain.handle('autoRules:save',   (_, { rule }) => autoRules.save(rule));
    ipcMain.handle('autoRules:remove', (_, { id }) => autoRules.remove(id));
    ipcMain.handle('autoRules:preview', (_, { rule }) => autoRules.preview(rule));
    ipcMain.handle('autoRules:apply',  (_, { id }) => autoRules.applyToExisting(id));

    // Post links of everything in the library (booru "already saved" marks).
    ipcMain.handle('library:sourceUrls', async () => {
        const rows = await Item.findAll({ attributes: ['sourceUrl'], where: { sourceUrl: { [Op.ne]: '' } }, raw: true });
        return rows.map(r => r.sourceUrl).filter(Boolean);
    });

    ipcMain.handle('library:itemRelations', async (_, { id }) => similarity.relationsOf(id));
    ipcMain.handle('library:findSimilar', async (event, { maxDistance }) => similarity.findSimilar(maxDistance, (pct) => {
        if (!event.sender.isDestroyed()) event.sender.send('library:similarProgress', pct);
    }));

    // ─── View history / recently viewed (per section) ────────────────────────
    ipcMain.handle('library:recordView',        async (_, p)  => viewHistory.recordView(p || {}));
    ipcMain.handle('library:getHistory',        async (_, p)  => viewHistory.getHistory(p || {}));
    ipcMain.handle('library:getHistorySections', async ()     => viewHistory.getHistorySections());
    ipcMain.handle('library:clearHistory',      async (_, p)  => viewHistory.clearHistory(p || {}));
    ipcMain.handle('library:removeHistory',     async (_, p)  => viewHistory.removeHistory(p || {}));

    // ─── Maintenance (Панель управления → Управление) ─────────────────────────
    ipcMain.handle('library:checkIntegrity', async () => maintenance.checkIntegrity());

    ipcMain.handle('library:cleanupIntegrity', async (_, { missingIds = [], orphanNames = [] }) => {
        const rec = await maintenance.removeMissingRecords(missingIds);
        const orp = await maintenance.removeOrphanFolders(orphanNames);
        return { ok: true, records: rec.count, folders: orp.count };
    });

    ipcMain.handle('library:generateMissingMedia', async (event) => {
        // The job keeps running in the main process even if the panel/window closes,
        // so guard the progress send against a destroyed webContents.
        return maintenance.generateMissingMedia((p) => {
            if (!event.sender.isDestroyed()) event.sender.send('library:maintenanceProgress', p);
        });
    });

    // Soft-delete (or permanently delete) many items at once — used by the duplicate
    // finder to trash the extra copies in one call.
    ipcMain.handle('library:deleteItems', async (_, { ids = [], permanent = false }) => {
        if (!ids.length) return { ok: true, count: 0 };
        if (permanent) {
            for (const id of ids) await hardDeleteItem(id);   // sequential: single SQLite writer
        } else {
            await Item.unscoped().update(
                { deletedAt: Math.floor(Date.now() / 1000) },
                { where: { id: { [Op.in]: ids } } },
            );
        }
        return { ok: true, count: ids.length };
    });

    ipcMain.handle('library:createCollection', async (_, { name, parentId, icon, color }) => {
        return Collection.create({ name, parentId, icon, color });
    });

    ipcMain.handle('library:updateCollection', async (_, { id, data }) => {
        const col = await Collection.findByPk(id);
        if (!col) throw new Error('Collection not found');

        // Reject a move that would create a cycle: walk up from the proposed parent —
        // if we reach this collection, the new parent is its own descendant.
        if (data.parentId !== undefined && data.parentId !== null) {
            if (data.parentId === id) throw new Error('Cannot set collection as its own parent');
            let cur = data.parentId;
            const seen = new Set();
            while (cur && !seen.has(cur)) {
                if (cur === id) throw new Error('Cannot move a collection into its own descendant');
                seen.add(cur);
                const node = await Collection.findByPk(cur, { attributes: ['parentId'] });
                cur = node?.parentId;
            }
        }

        await col.update(data);
        return col.toJSON();
    });

    ipcMain.handle('library:reorderCollections', async (_, { updates }) => {
        // Sequential inside one transaction: parallel writes contend for SQLite's
        // single writer and can throw SQLITE_BUSY.
        await sequelize.transaction(async (t) => {
            for (const { id, order, parentId } of updates) {
                await Collection.update(
                    { order, ...(parentId !== undefined ? { parentId } : {}) },
                    { where: { id }, transaction: t },
                );
            }
        });
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
                attributes: ['id', 'name', 'type', 'pinned'],
                limit: 10,
                order: [['pinned', 'DESC'], ['name', 'ASC']],   // pinned matches first
                subQuery: false, // ← ускоряет запрос с include + limit
            });

            return tags.map(t => ({ name: t.name, type: t.type, pinned: !!t.pinned, value: t.name, label: t.name }));
        } catch (e) {
            console.error('[searchTags] error:', e.message);
            return [];
        }
    });

    ipcMain.handle('library:reorderItems', async (_, { orderedIds }) => {
        // Sequential inside one transaction: parallel writes contend for SQLite's
        // single writer and can throw SQLITE_BUSY on a large reorder.
        await sequelize.transaction(async (t) => {
            for (let index = 0; index < orderedIds.length; index++) {
                await Item.unscoped().update(
                    { order: index }, { where: { id: orderedIds[index] }, transaction: t },
                );
            }
        });
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

    ipcMain.handle('library:importUrl', async (event, { url, collectionId, tags, sourceUrl, title }) => {
        return importFromUrl({
            url,
            collectionId,
            tags: Array.isArray(tags) ? tags : [],
            sourceUrl,
            title,
            onProgress: (p) => { if (!event.sender.isDestroyed()) event.sender.send('library:urlImportProgress', p); },
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
        const dirs = fs.readdirSync(itemsPath());
        let fixed = 0, skipped = 0, failed = 0;

        for (const id of dirs) {
            const itemDir = path.join(itemsPath(), id);
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