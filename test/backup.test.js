const sandbox = require('./helpers/sandbox');   // fakes electron; never the real data/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const backup = require(sandbox.serverPath('backup'));
const dir = path.join(sandbox.dir, 'backup-lib');
const dbPath = path.join(dir, 'library.db');
const DAY = 24 * 60 * 60 * 1000;

const open = (file, mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE) => new Promise((res, rej) => { const db = new sqlite3.Database(file, mode, e => (e ? rej(e) : res(db))); });
const run = (db, sql) => new Promise((res, rej) => db.run(sql, e => (e ? rej(e) : res())));
const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, rows) => (e ? rej(e) : res(rows))));

let writer;
test.before(async () => {
    fs.mkdirSync(dir, { recursive: true });
    writer = await open(dbPath);
    await run(writer, 'PRAGMA journal_mode = WAL');
    await run(writer, 'PRAGMA wal_autocheckpoint = 0');   // keep the rows in the -wal file
    await run(writer, 'CREATE TABLE t (v TEXT)');
    await run(writer, "INSERT INTO t VALUES ('a'), ('b')");
});
test.after(async () => {
    await new Promise(r => writer.close(r));
    await sandbox.cleanup();
});

test('a backup holds what is still only in the WAL file, while the database is open', async () => {
    assert.ok(fs.statSync(`${dbPath}-wal`).size > 0, 'the rows are in the WAL');
    const now = Date.UTC(2026, 10, 11, 12, 0, 0);
    const { created } = await backup.backupLibrary(dbPath, { now });
    assert.equal(path.basename(created), 'library_2026-11-11T12-00-00.db.bak');
    assert.equal(path.dirname(created), path.join(dir, 'backup'));
    const copy = await open(created, sqlite3.OPEN_READONLY);
    assert.deepEqual((await all(copy, 'SELECT v FROM t ORDER BY v')).map(r => r.v), ['a', 'b']);
    await new Promise(r => copy.close(r));
    assert.ok(!fs.existsSync(`${created}.part`));
});

test('nothing changed → no new copy; a change → a new one', async () => {
    const now = Date.UTC(2026, 10, 11, 13, 0, 0);
    assert.equal((await backup.backupLibrary(dbPath, { now })).created, null);
    await run(writer, "INSERT INTO t VALUES ('c')");
    const later = Date.UTC(2026, 10, 11, 14, 0, 0);
    assert.match(path.basename((await backup.backupLibrary(dbPath, { now: later })).created), /T14-00-00/);
});

test('old copies are thinned out: newest, one a day for a week, one a week for four weeks', async () => {
    const now = Date.UTC(2026, 10, 11, 12, 0, 0);
    const files = [];
    // Three copies a day for 60 days.
    for (let d = 0; d < 60; d++) for (const h of [1, 9, 17]) {
        const time = now - d * DAY - h * 3600 * 1000;
        files.push({ name: `x_${time}`, time });
    }
    const keep = backup.toKeep(files, now);
    assert.ok(keep.has(files[0].name), 'the newest');
    assert.ok(keep.size >= 7 && keep.size <= 7 + 5, `kept ${keep.size}`);
    const kept = files.filter(f => keep.has(f.name));
    assert.ok(kept.every(f => now - f.time < 5 * 7 * DAY), 'nothing older than the weekly window');
    assert.equal(new Set(kept.filter(f => now - f.time < 7 * DAY).map(f => Math.floor(f.time / DAY))).size,
        kept.filter(f => now - f.time < 7 * DAY).length, 'at most one per day');
    assert.deepEqual([...backup.toKeep([{ name: 'old', time: now - 400 * DAY }], now)], ['old'], 'the only copy stays, however old');
});

test('backup file names: our stamp only', () => {
    assert.equal(backup.stampOf('data_2025-08-01T10-20-30.db.bak'), Date.UTC(2025, 7, 1, 10, 20, 30));
    assert.equal(backup.stampOf('notes.txt'), null);
});

test('thinning runs on real files and leaves foreign files alone', async () => {
    const bdir = path.join(dir, 'backup');
    const now = Date.UTC(2026, 10, 11, 15, 0, 0);
    for (const d of [40, 41, 42]) {
        const stamp = new Date(now - d * DAY).toISOString().replace(/[:]/g, '-').split('.')[0];
        fs.writeFileSync(path.join(bdir, `library_${stamp}.db.bak`), 'old');
    }
    fs.writeFileSync(path.join(bdir, 'keep-me.txt'), 'x');
    const { removed } = await backup.backupLibrary(dbPath, { now });
    assert.equal(removed.length, 3);
    assert.ok(fs.existsSync(path.join(bdir, 'keep-me.txt')));
});
