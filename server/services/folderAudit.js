const fs = require('fs');
const path = require('path');
const { SUPPORTED_EXTENSIONS } = require('./importService');
const folderCheck = require('./folderCheck');

/**
 * Which files of a disk folder (with subfolders) are not in the library yet.
 * Read-only: nothing is imported or moved. Matching is by content, like the importer.
 */
function walk(dir, out) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full, out); continue; }
        if (!e.isFile() || !SUPPORTED_EXTENSIONS.has(path.extname(e.name).toLowerCase())) continue;
        try {
            const st = fs.statSync(full);
            out.push({ path: full, size: st.size, mtime: st.mtimeMs });
        } catch { /* vanished or unreadable */ }
    }
}

async function auditFolder(dir, onProgress) {
    if (!dir || !fs.statSync(dir).isDirectory()) throw new Error('Папка не найдена');
    const files = [];
    walk(dir, files);
    onProgress?.({ done: 0, total: files.length, scanned: true });

    const found = await folderCheck.checkFiles(files, onProgress);
    if (!found) return null;   // superseded by another check

    const missing = [];
    let inLibrary = 0, trashed = 0;
    for (const f of files) {
        const r = found[f.path];
        if (!r?.inLibrary) missing.push({ path: f.path, size: f.size, copies: r?.copies?.length || 0 });
        else if (r.inLibrary.trashed) trashed++;
        else inLibrary++;
    }
    missing.sort((a, b) => a.path.localeCompare(b.path));
    return { dir, total: files.length, inLibrary, trashed, missing };
}

module.exports = { auditFolder };
