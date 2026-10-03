const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./store');

/**
 * One page of a manga → a separate image in the library: titled after the manga
 * and the page, with the manga's tags, source link pointing at the manga page.
 *
 *   library manga: { itemId, file, page }   — tags / collection / link from the item
 *   online:        { source, url, resolve, page, title, tags: [{ name, type }], sourceUrl, collectionId }
 */
const safeName = (s) => String(s || 'manga').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'manga';

async function savePage(opts) {
    const { importFile } = require('../importService');
    const { Item, Tag } = require('../../models/associations');
    let src, title, tags, tagTypes = {}, sourceUrl, collectionId, notes;

    if (opts.itemId) {
        src = store.resolvePage(opts.itemId, opts.file || '');
        if (!src) throw new Error('Страница не найдена');
        const item = await Item.findByPk(opts.itemId, { include: [{ model: Tag, as: 'tags' }] });
        if (!item) throw new Error('Манга не найдена');
        title = item.title;
        tags = (item.tags || []).map(t => t.name);
        sourceUrl = item.sourceUrl || '';
        collectionId = item.collectionId || null;
    } else {
        const images = require('./images');
        const sources = require('./sources');
        src = await images.fetchImage(opts.source, opts.url, { resolve: !!opts.resolve });
        title = opts.title;
        const types = sources.get(opts.source).tagTypes || {};
        tags = (opts.tags || []).map(t => {
            const name = String(t.name || t).trim().toLowerCase();
            if (t.type && types[t.type] != null) tagTypes[name] = types[t.type];
            return name;
        }).filter(Boolean);
        sourceUrl = opts.sourceUrl || '';
        collectionId = opts.collectionId || null;
    }
    const n = Number(opts.page) || 1;
    const chapter = opts.chapterTitle ? ` · ${opts.chapterTitle}` : '';
    notes = `Страница ${n}${chapter} из «${title || 'манги'}»`;

    // A readable file name instead of 0001.jpg / a cache hash.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkframe-page-'));
    const tmp = path.join(tmpDir, `${safeName(title)} - p${String(n).padStart(3, '0')}${path.extname(src).toLowerCase() || '.jpg'}`);
    fs.copyFileSync(src, tmp);
    try {
        const res = await importFile({
            origin: 'manga',
            filePath: tmp,
            collectionId,
            tags,
            sourceUrl,
            overrides: { title: `${title || 'Манга'} — стр. ${n}${chapter}`, notes },
        });
        if (!res.skipped && Object.keys(tagTypes).length) {
            for (const [name, type] of Object.entries(tagTypes)) {
                await Tag.update({ type }, { where: { name, type: null } });
            }
        }
        return res.skipped
            ? { skipped: true, reason: res.reason, existingId: res.existingId, existingTitle: res.existingTitle, collectionName: res.collectionName }
            : { item: res.item };
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

module.exports = { savePage };
