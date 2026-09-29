const fs = require('fs');
const path = require('path');

/**
 * File operations for the Folders browser: rename, new folder, move, and delete —
 * which only ever goes to the system recycle bin (shell.trashItem), never a
 * permanent unlink. Errors come back as Russian messages for the UI.
 */

const BAD_NAME = /[<>:"/\\|?*\x00-\x1f]/;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

function checkName(name) {
    const n = String(name ?? '').trim();
    if (!n) throw new Error('Имя не может быть пустым');
    if (n === '.' || n === '..') throw new Error('Недопустимое имя');
    if (BAD_NAME.test(n)) throw new Error('Имя не может содержать символы < > : " / \\ | ? *');
    if (RESERVED.test(n)) throw new Error('Это имя зарезервировано Windows');
    if (/[. ]$/.test(n)) throw new Error('Имя не может заканчиваться точкой или пробелом');
    return n;
}

const exists = (p) => { try { fs.lstatSync(p); return true; } catch { return false; } };
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function rename(from, name) {
    const n = checkName(name);
    const to = path.join(path.dirname(from), n);
    if (samePath(from, to) && path.basename(from) === n) return { path: to };
    // Case-only rename ("a.jpg" → "A.jpg") is fine on Windows even though the target "exists".
    if (exists(to) && !samePath(from, to)) throw new Error(`«${n}» уже существует`);
    fs.renameSync(from, to);
    return { path: to };
}

function mkdir(dir, name) {
    const n = checkName(name);
    const p = path.join(dir, n);
    if (exists(p)) throw new Error(`«${n}» уже существует`);
    fs.mkdirSync(p);
    return { path: p };
}

// Moves files (not folders) into `dest`. Name clashes are skipped and reported;
// across drives the file is copied and the original removed only after the copy.
function move(paths, dest) {
    if (!fs.statSync(dest).isDirectory()) throw new Error('Папка назначения не найдена');
    const moved = [], skipped = [], failed = [];
    for (const from of paths) {
        const to = path.join(dest, path.basename(from));
        try {
            if (samePath(path.dirname(from), dest)) { skipped.push({ path: from, reason: 'same' }); continue; }
            if (!fs.statSync(from).isFile()) { skipped.push({ path: from, reason: 'folder' }); continue; }
            if (exists(to)) { skipped.push({ path: from, reason: 'exists' }); continue; }
            try {
                fs.renameSync(from, to);
            } catch (e) {
                if (e.code !== 'EXDEV') throw e;
                fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
                fs.unlinkSync(from);
            }
            moved.push(to);
        } catch (e) {
            failed.push({ path: from, error: e.message });
        }
    }
    return { moved, skipped, failed };
}

async function trash(paths, trashItem) {
    const done = [], failed = [];
    for (const p of paths) {
        try { await trashItem(path.resolve(p)); done.push(p); }
        catch (e) { failed.push({ path: p, error: e.message }); }
    }
    return { done, failed };
}

module.exports = { checkName, rename, mkdir, move, trash };
