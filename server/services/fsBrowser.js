/**
 * Local file-system browsing for the "Folders" source: directory listings with
 * enough metadata for a real file browser (sizes, dates, media kind, a peek inside
 * sub-folders for their preview tiles), drive discovery and per-file details.
 * Pure node — no electron — so it can be unit-tested directly.
 */
const fs = require('fs');
const path = require('path');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif', '.bmp', '.avif', '.heic', '.heif']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v', '.ts', '.m2ts', '.mts']);
const SKIP_NAMES = new Set(['.nomedia', '_gsdata_', '.stignore', '.stfolder', 'desktop.ini', 'thumbs.db', '$recycle.bin', 'system volume information']);

const PREVIEWS_PER_DIR = 3;
const MAX_DIRS_PEEKED = 300;   // big trees: only the first N sub-folders get previews

function mediaKind(name) {
    const ext = path.extname(name).toLowerCase();
    if (ext === '.gif') return 'gif';
    if (IMAGE_EXT.has(ext)) return 'image';
    if (VIDEO_EXT.has(ext)) return 'video';
    return 'other';
}

const isMedia = (name) => mediaKind(name) !== 'other';
const skip = (name) => SKIP_NAMES.has(name.toLowerCase());

const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

// A quick look inside a sub-folder: how many media files / folders it holds and the
// first few media files for the folder tile. One readdir, no stats.
// A folder holding only sub-folders borrows previews from them (one level down,
// like Explorer does), so it doesn't look empty.
function peekDir(dir, depth = 0) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const media = [];
        const subdirs = [];
        for (const e of entries) {
            if (skip(e.name)) continue;
            if (e.isDirectory()) subdirs.push(e.name);
            else if (isMedia(e.name)) media.push(e.name);
        }
        media.sort(byName);
        const previews = media.slice(0, PREVIEWS_PER_DIR).map(n => path.join(dir, n));
        if (depth === 0 && previews.length < PREVIEWS_PER_DIR && subdirs.length) {
            subdirs.sort(byName);
            for (const sub of subdirs.slice(0, 4)) {
                const inner = peekDir(path.join(dir, sub), 1);
                previews.push(...inner.previews.slice(0, PREVIEWS_PER_DIR - previews.length));
                if (previews.length >= PREVIEWS_PER_DIR) break;
            }
        }
        return { files: media.length, dirs: subdirs.length, previews };
    } catch {
        return { files: 0, dirs: 0, previews: [], denied: true };
    }
}

/**
 * List `dir`. Folders get a peek (counts + preview files); files get size, dates
 * and kind. Non-media files are counted but not returned (the browser shows media).
 */
function listDir(dir) {
    const abs = path.resolve(dir);
    const dirents = fs.readdirSync(abs, { withFileTypes: true });

    const folders = [];
    const files = [];
    let otherFiles = 0;
    let totalSize = 0;

    for (const e of dirents) {
        if (skip(e.name)) continue;
        const full = path.join(abs, e.name);
        if (e.isDirectory()) {
            folders.push({ name: e.name, path: full, isDir: true });
            continue;
        }
        if (!isMedia(e.name)) { otherFiles++; continue; }
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        totalSize += st.size;
        files.push({
            name: e.name,
            path: full,
            isDir: false,
            kind: mediaKind(e.name),
            ext: path.extname(e.name).slice(1).toLowerCase(),
            size: st.size,
            mtime: Math.floor(st.mtimeMs),
            ctime: Math.floor(st.birthtimeMs || st.ctimeMs),
        });
    }

    folders.sort((a, b) => byName(a.name, b.name));
    folders.forEach((f, i) => {
        if (i < MAX_DIRS_PEEKED) Object.assign(f, peekDir(f.path));
        try { f.mtime = Math.floor(fs.statSync(f.path).mtimeMs); } catch { f.mtime = 0; }
    });

    const parent = path.dirname(abs);
    return {
        path: abs,
        parent: parent !== abs ? parent : null,
        folders,
        files,
        stats: { folders: folders.length, files: files.length, otherFiles, totalSize },
    };
}

// Drive roots. Probing letters with fs calls blocks on dead network mappings, so on
// Windows we ask .NET for the list (instant) and read label / free space only for
// local drives. Async, time-boxed, cached for a minute.
const PS_DRIVES =
    "[System.IO.DriveInfo]::GetDrives() | ForEach-Object { $l=''; $f=0; $t=0; " +
    "if ($_.DriveType -eq 'Fixed' -or $_.DriveType -eq 'Removable') { try { if ($_.IsReady) " +
    "{ $l=$_.VolumeLabel; $f=$_.AvailableFreeSpace; $t=$_.TotalSize } } catch {} }; " +
    "$_.Name + '|' + $_.DriveType + '|' + $l + '|' + $f + '|' + $t }";

let drivesCache = null;

function listDrives() {
    if (process.platform !== 'win32') return Promise.resolve([{ path: '/', label: '/', type: 'Fixed' }]);
    if (drivesCache && Date.now() - drivesCache.at < 60000) return Promise.resolve(drivesCache.list);

    const { execFile } = require('child_process');
    return new Promise((resolve) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_DRIVES],
            { timeout: 8000, windowsHide: true },
            (err, stdout) => {
                const list = String(stdout || '').split(/\r?\n/).filter(Boolean).map(line => {
                    const [root, type, label, free, total] = line.split('|');
                    return {
                        path: root,
                        label: root.replace(/\\$/, ''),
                        name: label || '',
                        type,                               // Fixed | Removable | Network | CDRom …
                        free: Number(free) || null,
                        total: Number(total) || null,
                    };
                });
                if (list.length) drivesCache = { at: Date.now(), list };
                resolve(list.length ? list : [{ path: 'C:\\', label: 'C:', name: '', type: 'Fixed' }]);
            });
    });
}

// Size + dates for one file; dimensions / duration are filled in by the caller
// (sharp / ffprobe live in other services).
function statFile(file) {
    const st = fs.statSync(file);
    return {
        name: path.basename(file),
        path: file,
        dir: path.dirname(file),
        kind: mediaKind(file),
        ext: path.extname(file).slice(1).toLowerCase(),
        size: st.size,
        mtime: Math.floor(st.mtimeMs),
        ctime: Math.floor(st.birthtimeMs || st.ctimeMs),
    };
}

module.exports = { listDir, listDrives, statFile, peekDir, mediaKind, isMedia, IMAGE_EXT, VIDEO_EXT };
