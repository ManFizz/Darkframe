const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Backups of every library database (the registry's list, not just the active one).
 *
 * A copy is made with `VACUUM INTO` on a read-only connection: the database runs in
 * WAL mode, so copying the .db file alone (while it's open) can miss what is still
 * in the -wal file. VACUUM INTO writes one complete, consistent database.
 *
 * Each library's copies sit next to its database: <db folder>/backup/<name>_<UTC
 * time>.db.bak (for the legacy library that's data/backup/data_….db.bak, as before).
 * A copy identical to the previous one isn't kept. Kept: the newest copy, one per
 * day for the last KEEP_DAYS days, one per week for the last KEEP_WEEKS weeks.
 */

const KEEP_DAYS = 7;
const KEEP_WEEKS = 4;
const DAY = 24 * 60 * 60 * 1000;
const STAMP = /_(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})\.db\.bak$/;

const backupDir = (dbPath) => path.join(path.dirname(dbPath), 'backup');
const prefixOf = (dbPath) => path.basename(dbPath, path.extname(dbPath));
const stampNow = (now) => new Date(now).toISOString().replace(/[:]/g, '-').split('.')[0];

// Time of a backup from its file name (UTC), or null for files that aren't ours.
function stampOf(name) {
    const m = STAMP.exec(name);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

/**
 * Which backups stay. files: [{ name, time }] → Set of names. The newest always;
 * then the newest of each day within KEEP_DAYS and of each week within KEEP_WEEKS.
 */
function toKeep(files, now = Date.now()) {
    const sorted = [...files].sort((a, b) => b.time - a.time);
    const keep = new Set(sorted.slice(0, 1).map(f => f.name));
    const days = new Set();
    const weeks = new Set();
    for (const f of sorted) {
        const age = now - f.time;
        const day = Math.floor(f.time / DAY);
        const week = Math.floor((day + 3) / 7);   // weeks start on Monday (1970-01-01 was a Thursday)
        if (age < KEEP_DAYS * DAY && !days.has(day)) { days.add(day); keep.add(f.name); }
        if (age < KEEP_WEEKS * 7 * DAY && !weeks.has(week)) { weeks.add(week); keep.add(f.name); }
    }
    return keep;
}

function hashFile(file) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        fs.createReadStream(file).on('data', c => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
    });
}

function vacuumInto(dbPath, dest) {
    const sqlite3 = require('sqlite3');
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) { reject(err); return; }
            db.run(`VACUUM INTO '${dest.replace(/'/g, "''")}'`, (e) => {
                db.close(() => (e ? reject(e) : resolve()));
            });
        });
    });
}

// Our backups in a folder → [{ name, time }].
async function listBackups(dir, prefix) {
    let names = [];
    try { names = await fsp.readdir(dir); } catch { return []; }
    return names
        .filter(n => n.startsWith(`${prefix}_`))
        .map(name => ({ name, time: stampOf(name) }))
        .filter(f => f.time !== null);
}

/**
 * One library: a new copy (unless nothing changed), then the old ones thinned out.
 * → { created: path | null, removed: [names] }
 */
async function backupLibrary(dbPath, { now = Date.now() } = {}) {
    if (!fs.existsSync(dbPath)) return { created: null, removed: [] };
    const dir = backupDir(dbPath);
    const prefix = prefixOf(dbPath);
    await fsp.mkdir(dir, { recursive: true });

    const before = await listBackups(dir, prefix);
    const dest = path.join(dir, `${prefix}_${stampNow(now)}.db.bak`);
    const tmp = `${dest}.part`;
    let created = null;
    try {
        await fsp.rm(tmp, { force: true });
        await vacuumInto(dbPath, tmp);
        const last = before.sort((a, b) => b.time - a.time)[0];
        const same = last && (await hashFile(tmp)) === (await hashFile(path.join(dir, last.name)).catch(() => null));
        if (same) await fsp.rm(tmp, { force: true });
        else { await fsp.rename(tmp, dest); created = dest; }
    } finally {
        await fsp.rm(tmp, { force: true }).catch(() => {});
    }

    const all = await listBackups(dir, prefix);
    const keep = toKeep(all, now);
    const removed = [];
    for (const f of all) {
        if (keep.has(f.name)) continue;
        try { await fsp.unlink(path.join(dir, f.name)); removed.push(f.name); }
        catch (e) { console.warn('[backup] could not remove', f.name, e.message); }
    }
    return { created, removed };
}

// Every library in the registry, one after another; one failing doesn't stop the rest.
async function backupAll() {
    const libraries = require('./libraryRegistry').listLibraries();
    for (const lib of libraries) {
        try {
            const { created, removed } = await backupLibrary(lib.dbPath);
            console.log(`[backup] ${lib.name}: ${created ? `копия ${path.basename(created)}` : 'без изменений'}`
                + (removed.length ? `, удалено старых: ${removed.length}` : ''));
        } catch (e) {
            console.error(`[backup] ${lib.name}: ${e.message}`);
        }
    }
}

// At start (a little later, not to slow it down) and once a day while running — the
// app often stays in the tray for days.
let timer = null;
function scheduleBackups({ firstDelay = 30 * 1000 } = {}) {
    if (timer) return;
    const runSafe = () => backupAll().catch(e => console.error('[backup]', e));
    setTimeout(runSafe, firstDelay).unref?.();
    timer = setInterval(runSafe, DAY);
    timer.unref?.();
}

module.exports = { scheduleBackups, backupAll, backupLibrary, toKeep, stampOf, KEEP_DAYS, KEEP_WEEKS };
