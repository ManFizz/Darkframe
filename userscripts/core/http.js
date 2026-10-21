// HTTP for every site: GM_xmlhttpRequest (any host listed in @connect, no CORS) as
// a promise, and waiting out rate limits.

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);

// → { status, json, text, response, header(name) }. `raw` — a body sent as is
// (bytes); `body` — sent as JSON.
function gm(method, url, { body, raw, headers = {}, timeout = 60000, responseType } = {}) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method, url, timeout, responseType,
            headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
            data: body ? JSON.stringify(body) : (raw ?? null),
            onload: (r) => {
                const binary = responseType === 'arraybuffer' || responseType === 'blob';
                let json = null;
                if (!binary) { try { json = JSON.parse(r.responseText); } catch { /* not JSON */ } }
                const header = (name) => new RegExp(`^${name}:\\s*(.*)$`, 'im').exec(r.responseHeaders || '')?.[1]?.trim();
                resolve({ status: r.status, json, text: binary ? '' : r.responseText, response: r.response, header });
            },
            onerror:   () => reject(new Error('network')),
            ontimeout: () => reject(new Error('timeout')),
        });
    });
}

// `request()` → a response with `status` and, for a 429, `retryAfter` (seconds, if
// the site said). Repeats after a 429, waiting longer each time.
async function retrying(request, { attempts = 6, onWait = () => {}, what = 'Сайт' } = {}) {
    for (let i = 0; i < attempts; i++) {
        const r = await request();
        if (r.status !== 429) return r;
        const wait = r.retryAfter || 20 * (i + 1);
        onWait(`${what} просит подождать: ${Math.ceil(wait)} с…`);
        await sleep(wait * 1000 + 500);
    }
    throw new Error(`${what} долго не снимает ограничение (429)`);
}

module.exports = { gm, sleep, now, retrying };
