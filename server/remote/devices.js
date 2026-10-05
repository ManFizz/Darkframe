const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

/**
 * Phones / browsers allowed to use the library over the home network.
 *
 * A device is paired once: the desktop shows a QR code with a short-lived one-time
 * code, the phone opens it and gets its own long random token (kept in a cookie).
 * Only the token's SHA-256 is stored here, so this file can't be replayed. Each
 * device has an access level — "full" (like the desktop, minus PC-only things) or
 * "view" (browse and read; ratings, tags, deletions are refused) — and can be
 * revoked at any time.
 *
 * userData/remote-access.json: { enabled, port, devices: [{ id, name, hash, access, createdAt, lastSeenAt, agent }] }
 */
let fileOverride = null;
const file = () => fileOverride || path.join(require('electron').app.getPath('userData'), 'remote-access.json');
const setFile = (f) => { fileOverride = f; cache = null; };

const DEFAULT_PORT = 7860;
const CODE_TTL = 10 * 60 * 1000;
let cache = null;
const codes = new Map();   // code → { access, name, expires }

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const now = () => Math.floor(Date.now() / 1000);

function load() {
    if (cache) return cache;
    try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { cache = {}; }
    if (typeof cache.enabled !== 'boolean') cache.enabled = false;
    if (!Number.isInteger(cache.port)) cache.port = DEFAULT_PORT;
    if (!Array.isArray(cache.devices)) cache.devices = [];
    return cache;
}
function save() {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8');
}

const publicDevice = (d) => ({ id: d.id, name: d.name, access: d.access, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt, agent: d.agent || '' });

function settings() {
    const c = load();
    return { enabled: c.enabled, port: c.port };
}
function setSettings({ enabled, port }) {
    const c = load();
    if (typeof enabled === 'boolean') c.enabled = enabled;
    if (port != null) {
        const p = Number(port);
        if (!Number.isInteger(p) || p < 1024 || p > 65535) throw new Error('Порт — число от 1024 до 65535');
        c.port = p;
    }
    save();
    return settings();
}

const list = () => load().devices.map(publicDevice);

// One-time code for the QR / link; `access` and `name` go to the device it pairs.
function createCode({ access = 'full', name = '' } = {}) {
    for (const [k, v] of codes) if (v.expires < Date.now()) codes.delete(k);
    const code = crypto.randomBytes(9).toString('base64url');
    codes.set(code, { access: access === 'view' ? 'view' : 'full', name: String(name || '').slice(0, 60), expires: Date.now() + CODE_TTL });
    return { code, expiresIn: CODE_TTL / 1000 };
}

// Code → a new device and its token (shown to the device once, as a cookie).
function redeem(code, agent = '') {
    const c = codes.get(String(code || ''));
    if (!c || c.expires < Date.now()) return null;
    codes.delete(code);
    const token = `dfr_${crypto.randomBytes(32).toString('base64url')}`;
    const d = {
        id: crypto.randomUUID(),
        name: c.name || guessName(agent),
        hash: sha(token),
        access: c.access,
        createdAt: now(),
        lastSeenAt: now(),
        agent: String(agent || '').slice(0, 200),
    };
    load().devices.push(d);
    save();
    return { token, device: publicDevice(d) };
}

function guessName(agent) {
    const a = String(agent || '');
    if (/iPhone/i.test(a)) return 'iPhone';
    if (/iPad/i.test(a)) return 'iPad';
    const android = a.match(/Android[^;)]*;\s*([^;)]+?)\s+Build/i);
    if (android) return android[1];
    if (/Android/i.test(a)) return 'Android';
    if (/Windows/i.test(a)) return 'Windows';
    if (/Mac OS/i.test(a)) return 'Mac';
    return 'Устройство';
}

let seenTimer = null;
// Token → device (or null). Last-seen times are written in batches.
function check(token) {
    if (!token) return null;
    const h = sha(token);
    const d = load().devices.find(x => x.hash === h);
    if (!d) return null;
    const t = now();
    if (t - (d.lastSeenAt || 0) > 60) {
        d.lastSeenAt = t;
        if (!seenTimer) seenTimer = setTimeout(() => { seenTimer = null; try { save(); } catch { /* ignore */ } }, 5000);
    }
    return publicDevice(d);
}

function update(id, { name, access }) {
    const d = load().devices.find(x => x.id === id);
    if (!d) throw new Error('Устройство не найдено');
    if (name != null) d.name = String(name).slice(0, 60) || d.name;
    if (access === 'full' || access === 'view') d.access = access;
    save();
    return list();
}

function revoke(id) {
    const c = load();
    c.devices = c.devices.filter(x => x.id !== id);
    save();
    return list();
}

// Addresses of this computer in the home network (IPv4, not loopback / virtual).
function lanAddresses() {
    const out = [];
    for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
        for (const a of addrs || []) {
            if (a.family !== 'IPv4' || a.internal) continue;
            if (/^169\.254\./.test(a.address)) continue;
            const virtual = /vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker|vbox|Loopback/i.test(name);
            out.push({ name, address: a.address, virtual });
        }
    }
    // Typical home networks first, virtual adapters last.
    const rank = (a) => (a.virtual ? 2 : /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(a.address) ? 0 : 1);
    return out.sort((a, b) => rank(a) - rank(b));
}

module.exports = { settings, setSettings, list, createCode, redeem, check, update, revoke, lanAddresses, setFile, DEFAULT_PORT };
