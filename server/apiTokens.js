const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Local API access tokens (GitHub-PAT style): each browser extension / userscript gets
// its own named token with a chosen set of scopes. No accounts — this is a client app;
// the token itself is the credential. Only the SHA-256 hash is stored, so a leaked
// tokens file can't be replayed. Tokens live in userData (app-global, not per-library).

const FILE   = path.join(app.getPath('userData'), 'api-tokens.json');
const PREFIX = 'dfp_';   // darkframe personal token

// Known scopes → which endpoints they unlock (see apiServer).
const SCOPES = [
    { id: 'import',      label: 'Импорт медиа (add / addBase64)' },
    { id: 'read',        label: 'Чтение (коллекции, статистика)' },
    { id: 'collections', label: 'Создание коллекций' },
    { id: 'rim',         label: 'Обратный поиск по картинке (rim)' },
];
const SCOPE_IDS = SCOPES.map(s => s.id);

let cache = null;

function load() {
    if (cache) return cache;
    try {
        cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {
        cache = { requireAuth: true, tokens: [] };
    }
    if (typeof cache.requireAuth !== 'boolean') cache.requireAuth = true;
    if (!Array.isArray(cache.tokens)) cache.tokens = [];
    return cache;
}

function save() {
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8');
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const now = () => Math.floor(Date.now() / 1000);

// Never expose the hash to the renderer.
function publicToken(t) {
    return {
        id: t.id, name: t.name, prefix: t.prefix, scopes: t.scopes,
        enabled: t.enabled, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt,
    };
}

function getConfig() {
    const c = load();
    return { requireAuth: c.requireAuth, scopes: SCOPES };
}

function setRequireAuth(v) {
    const c = load();
    c.requireAuth = !!v;
    save();
    return { requireAuth: c.requireAuth };
}

function list() {
    return load().tokens.map(publicToken);
}

// Returns the RAW token exactly once (only the hash is persisted).
function create({ name, scopes } = {}) {
    const c = load();
    const raw = PREFIX + crypto.randomBytes(24).toString('hex');
    const t = {
        id:        crypto.randomUUID(),
        name:      String(name || 'token').slice(0, 100),
        prefix:    raw.slice(0, PREFIX.length + 6) + '…',   // shown in the list
        tokenHash: sha(raw),
        scopes:    (Array.isArray(scopes) ? scopes : []).filter(s => SCOPE_IDS.includes(s)),
        enabled:   true,
        createdAt: now(),
        lastUsedAt: null,
    };
    c.tokens.push(t);
    save();
    return { token: raw, info: publicToken(t) };
}

function revoke(id) {
    const c = load();
    const before = c.tokens.length;
    c.tokens = c.tokens.filter(t => t.id !== id);
    save();
    return { ok: c.tokens.length < before };
}

function setEnabled(id, enabled) {
    const c = load();
    const t = c.tokens.find(x => x.id === id);
    if (t) { t.enabled = !!enabled; save(); }
    return { ok: !!t };
}

// Called by the API server on every protected request. Returns a truthy result when
// access is allowed (either auth is disabled, or a valid enabled token holds the scope).
function verify(rawToken, requiredScope) {
    const c = load();
    if (!c.requireAuth) return { bypass: true };
    if (!rawToken) return null;

    const h = sha(rawToken);
    const t = c.tokens.find(x => x.tokenHash === h && x.enabled);
    if (!t) return null;
    if (requiredScope && !t.scopes.includes(requiredScope)) return null;

    t.lastUsedAt = now();
    save();
    return t;
}

module.exports = {
    SCOPES, SCOPE_IDS,
    getConfig, setRequireAuth, list, create, revoke, setEnabled, verify,
};
