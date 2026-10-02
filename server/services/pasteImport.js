const fs = require('fs');
const os = require('os');
const path = require('path');
const { clipboard } = require('electron');
const { importFiles, importFile, SUPPORTED_EXTENSIONS } = require('./importService');
const { importFromUrl } = require('./urlImportService');

/**
 * Ctrl+V in the library: whatever is on the clipboard goes into the open collection.
 *   1. files copied in Explorer,
 *   2. an image (screenshot, "Copy image" in a browser),
 *   3. text with direct media links (one or several).
 * Returns the usual { results, skipped, errors } plus `kind` of what was found
 * (null — nothing usable on the clipboard).
 */

// Explorer puts copied files on the clipboard as CF_HDROP; Electron exposes the
// first one as "FileNameW" (UTF-16). Several files: read the list from CF_HDROP.
function clipboardFiles() {
    const out = [];
    try {
        const hdrop = clipboard.readBuffer('CF_HDROP');
        if (hdrop?.length > 20) {
            // DROPFILES header: offset of the list (DWORD), then fWide at byte 16.
            const offset = hdrop.readUInt32LE(0);
            const wide = hdrop.readUInt32LE(16) !== 0;
            const text = wide ? hdrop.slice(offset).toString('utf16le') : hdrop.slice(offset).toString('latin1');
            out.push(...text.split('\0').filter(Boolean));
        }
    } catch { /* not there */ }
    if (!out.length) {
        try {
            const one = clipboard.readBuffer('FileNameW').toString('utf16le').replace(/\0+$/, '');
            if (one) out.push(one);
        } catch { /* not there */ }
    }
    return out.filter(p => fs.existsSync(p));
}

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');

async function pasteImport({ collectionId = null } = {}) {
    const files = clipboardFiles();
    if (files.length) {
        const media = [];
        for (const p of files) {
            if (fs.statSync(p).isDirectory()) continue;   // folders: use "Импорт папки"
            if (SUPPORTED_EXTENSIONS.has(path.extname(p).toLowerCase())) media.push(p);
        }
        if (!media.length) return { kind: 'files', results: [], skipped: [], errors: [{ error: 'Среди скопированных файлов нет картинок и видео' }] };
        return { kind: 'files', ...(await importFiles({ filePaths: media, collectionId })) };
    }

    const img = clipboard.readImage();
    if (!img.isEmpty()) {
        const tmp = path.join(os.tmpdir(), `darkframe-paste-${Date.now()}.png`);
        fs.writeFileSync(tmp, img.toPNG());
        try {
            const res = await importFile({ filePath: tmp, collectionId, overrides: { title: `Вставка ${stamp()}` } });
            return { kind: 'image', results: res.skipped ? [] : [res.item], skipped: res.skipped ? [res] : [], errors: [] };
        } finally {
            fs.rmSync(tmp, { force: true });
        }
    }

    const urls = (clipboard.readText() || '').match(/https?:\/\/[^\s"'<>]+/gi) || [];
    if (urls.length) {
        const all = { kind: 'links', results: [], skipped: [], errors: [], manga: [] };
        // Gallery links of the manga sources go to the manga download queue.
        const mangaSources = require('./manga/sources');
        const downloads = require('./manga/downloads');
        const plain = [];
        for (const url of [...new Set(urls)]) {
            const m = mangaSources.matchUrl(url);
            if (m) all.manga.push(await downloads.enqueue({ source: m.source, id: m.id, collectionId }));
            else plain.push(url);
        }
        if (!plain.length) all.kind = 'manga';
        for (const url of plain.slice(0, 50)) {
            const res = await importFromUrl({ url, collectionId, sourceUrl: url });
            all.results.push(...res.results);
            all.skipped.push(...res.skipped);
            all.errors.push(...res.errors);
        }
        return all;
    }
    return { kind: null, results: [], skipped: [], errors: [] };
}

module.exports = { pasteImport };
