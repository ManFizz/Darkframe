const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ops = require('./ffmpegOps');

/**
 * Videos the player can't open as they are (.ts / .m2ts / .mts) get an MP4 twin,
 * made once (a lossless repack when possible) and kept in a cache folder keyed by
 * path + size + date — the Folders viewer plays the twin, the original stays put.
 */
const REMUX_EXT = new Set(['.ts', '.m2ts', '.mts']);
const needsRemux = (file) => REMUX_EXT.has(path.extname(String(file)).toLowerCase());

let dirOverride = null;
const cacheDir = () => dirOverride || path.join(require('electron').app.getPath('userData'), 'cache', 'remux');
const setCacheDir = (d) => { dirOverride = d; };
const jobs = new Map();

function playable(src) {
    const st = fs.statSync(src);
    const key = crypto.createHash('sha1').update(`${path.resolve(src).toLowerCase()}|${st.size}|${Math.floor(st.mtimeMs)}`).digest('hex');
    const dst = path.join(cacheDir(), `${key}.mp4`);
    if (fs.existsSync(dst)) {
        try { fs.utimesSync(dst, new Date(), new Date()); } catch { /* ignore */ }
        return Promise.resolve(dst);
    }
    if (!jobs.has(key)) {
        fs.mkdirSync(cacheDir(), { recursive: true });
        jobs.set(key, ops.remuxToMp4(src, dst).finally(() => jobs.delete(key)));
    }
    return jobs.get(key);
}

// Old twins go after two weeks; at most ~10 GB.
function prune({ maxAgeDays = 14, maxBytes = 10 * 1024 ** 3 } = {}) {
    let files;
    try { files = fs.readdirSync(cacheDir()).filter(n => n.endsWith('.mp4')).map(n => { const f = path.join(cacheDir(), n); const s = fs.statSync(f); return { f, t: s.mtimeMs, s: s.size }; }); }
    catch { return; }
    const old = Date.now() - maxAgeDays * 86400000;
    let total = 0;
    files.sort((a, b) => b.t - a.t).forEach(x => { total += x.s; if (x.t < old || total > maxBytes) fs.rmSync(x.f, { force: true }); });
}

module.exports = { needsRemux, playable, prune, setCacheDir, REMUX_EXT };
