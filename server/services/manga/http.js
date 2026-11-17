/**
 * Network for manga sources: a persistent session of its own (partition
 * "persist:manga") — cookies of the sites (AllHentai session, e-hentai settings,
 * a login done in the site window) live there and survive restarts.
 *
 * Outside Electron (tests) it falls back to plain fetch with a small cookie jar.
 */
let electron = null;
try { electron = require('electron'); } catch { /* tests */ }

const PARTITION = 'persist:manga';
const UA = () => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome || '148.0.0.0'} Safari/537.36`;

const jar = new Map();   // fallback cookie jar: host → Map(name → value)

function session() {
    try { return electron?.session?.fromPartition ? electron.session.fromPartition(PARTITION) : null; }
    catch { return null; }
}

async function request(url, { method = 'GET', headers = {}, body, referer, signal } = {}) {
    const h = { 'User-Agent': UA(), 'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8', ...headers };
    const ses = session();
    if (ses) {
        // Chromium checks a Referer header against the default policy: to another
        // origin only the origin itself may be sent (a full URL fails with
        // ERR_BLOCKED_BY_CLIENT). The fetch `referrer` option is ignored here.
        if (referer) {
            try {
                const r = new URL(referer);
                h.Referer = r.origin === new URL(url).origin ? referer : `${r.origin}/`;
            } catch { /* bad referer — none */ }
        }
        return ses.fetch(url, { method, headers: h, body, signal, credentials: 'include' });
    }
    if (referer) h.Referer = referer;
    // Plain fetch + manual cookies (tests, scripts).
    const host = new URL(url).hostname;
    const cookies = jar.get(host);
    if (cookies?.size) h.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') + (h.Cookie ? `; ${h.Cookie}` : '');
    const res = await fetch(url, { method, headers: h, body, signal, redirect: 'follow' });
    const set = res.headers.getSetCookie?.() || [];
    if (set.length) {
        const m = jar.get(host) || new Map();
        set.forEach(c => { const [kv] = c.split(';'); const i = kv.indexOf('='); if (i > 0) m.set(kv.slice(0, i).trim(), kv.slice(i + 1)); });
        jar.set(host, m);
    }
    return res;
}

// Where a URL ends up after redirects (session fetch doesn't report res.url).
function finalUrl(url) {
    const ses = session();
    if (!ses || !electron?.net?.request) {
        return request(url).then(r => { r.body?.cancel?.().catch?.(() => {}); return r.url || url; });
    }
    return new Promise((resolve, reject) => {
        let last = url;
        const req = electron.net.request({ url, session: ses, redirect: 'manual', useSessionCookies: true });
        req.setHeader('User-Agent', UA());
        req.on('redirect', (status, method, redirectUrl) => { last = redirectUrl; req.followRedirect(); });
        req.on('response', (res) => {
            res.on('data', () => {});
            res.on('end', () => resolve(last));
            res.on('error', () => resolve(last));
        });
        req.on('error', reject);
        req.end();
    });
}

async function text(url, opts) {
    const res = await request(url, opts);
    const body = await res.text();
    if (!res.ok && !opts?.allowError) {
        const cf = res.headers.get('cf-mitigated') === 'challenge';
        const err = new Error(cf ? 'Сайт закрыт проверкой Cloudflare — откройте его кнопкой «Сайт» и пройдите проверку' : `HTTP ${res.status}`);
        err.status = res.status;
        err.code = cf ? 'CF_CHALLENGE' : 'HTTP';
        throw err;
    }
    return { status: res.status, url: res.url, body, headers: res.headers };
}

async function json(url, opts) {
    const r = await text(url, opts);
    try { return JSON.parse(r.body); }
    catch { throw new Error('Сайт вернул не JSON'); }
}

async function buffer(url, opts) {
    const res = await request(url, opts);
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
    return { buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || '' };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…' };
function decode(s) {
    return String(s ?? '')
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
const stripTags = (s) => decode(String(s ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')); return m ? decode(m[2] ?? m[3]) : null; };

module.exports = { request, text, json, buffer, finalUrl, decode, stripTags, attr, UA, PARTITION, session };
