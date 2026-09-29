const fs = require('fs');
const sequelize = require('../database');
const registry = require('../libraryRegistry');

/**
 * Opening a library database (on start and when switching libraries) without
 * restarting the app: the shared Sequelize instance is re-pointed at the other
 * file, the schema / migrations run for it, and everything in the main process
 * that cached data of the previous library is reset.
 */

// Schema + migrations + built-in rows for the currently open database.
async function prepareDatabase() {
    await sequelize.authenticate();
    await sequelize.query('PRAGMA journal_mode = WAL;');
    await sequelize.query('PRAGMA busy_timeout = 5000;');
    await sequelize.sync();
    await require('../migrations').migrations();
    await require('../favoritesCollection').ensureFavoritesCollection();
    // Background: content hashes for items imported before hashing existed.
    require('./importService').hashExistingItems();
}

function resetCaches() {
    require('./undoJournal').clear();   // its snapshots belong to the old database
    require('./autoRules').invalidate();
    require('./tagAdmin').invalidateAliasCache();
}

let switching = null;

async function switchLibrary(id) {
    if (switching) throw new Error('Библиотека уже переключается');
    const from = registry.getActive();
    if (from.id === id) return { changed: false };
    const to = registry.listLibraries().find(l => l.id === id);
    if (!to) throw new Error('Библиотека не найдена');
    if (require('./libraryEvents').importActive()) {
        throw new Error('Идёт импорт — дождись его окончания и переключи библиотеку снова');
    }

    const watch = require('./watchFolders');
    switching = (async () => {
        watch.stop();
        try {
            registry.setActive(id);
            fs.mkdirSync(to.itemsPath, { recursive: true });
            await sequelize.switchStorage(to.dbPath);
            resetCaches();
            await prepareDatabase();
        } catch (e) {
            // Roll back to the library that was open, so the app stays usable.
            console.error('[library] switch failed, staying on', from.name, e);
            registry.setActive(from.id);
            await sequelize.switchStorage(from.dbPath);
            resetCaches();
            throw new Error(`Не удалось открыть «${to.name}»: ${e.message}`);
        } finally {
            watch.start().catch(err => console.warn('[watch] start failed:', err.message));
        }
        return { changed: true };
    })();
    try { return await switching; } finally { switching = null; }
}

module.exports = { prepareDatabase, switchLibrary };
