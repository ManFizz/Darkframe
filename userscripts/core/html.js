// Reading ordinary web pages: meta tags, JSON-LD, the canonical link, and fetching
// another page of the site to read it the same way.

const { gm, sleep } = require('./http');

const meta = (doc, selector) => doc.querySelector(selector)?.getAttribute('content') || null;

// The first JSON-LD block that describes a video (or has its file link).
function jsonLd(doc) {
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
        try {
            const data = JSON.parse(s.textContent);
            for (const d of Array.isArray(data) ? data : [data]) {
                if (d && (d['@type'] === 'VideoObject' || d.contentUrl)) return d;
            }
        } catch { /* not JSON */ }
    }
    return null;
}

const canonical = (doc, fallback) => {
    const href = doc.querySelector('link[rel=canonical]')?.getAttribute('href');
    try { return href ? new URL(href, fallback || location.href).href : (fallback || location.href); } catch { return fallback || location.href; }
};

// Text of the elements → lowercase, trimmed, without blanks and repeats.
const words = (els) => [...new Set([...els].map(e => (e.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean))];

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

// Another page: the page's own fetch (same origin, with cookies), or GM for other
// hosts; a few attempts with a growing pause.
async function fetchDoc(url, { viaGm = false, attempts = 3, timeout = 15000 } = {}) {
    let last;
    for (let i = 1; i <= attempts; i++) {
        try {
            if (viaGm) {
                const r = await gm('GET', url, { timeout });
                if (r.status < 200 || r.status >= 400) throw new Error(`HTTP ${r.status}`);
                return parse(r.text);
            }
            const res = await fetch(url, { credentials: 'include', headers: { Accept: 'text/html' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return parse(await res.text());
        } catch (e) {
            last = e;
            if (i < attempts) await sleep(400 * i);
        }
    }
    throw new Error(`страница не загрузилась: ${last?.message || 'ошибка'}`);
}

module.exports = { meta, jsonLd, canonical, words, parse, fetchDoc };
