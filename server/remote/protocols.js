/**
 * The custom-protocol handlers of the app (library://, mangaimg://, mediacache://,
 * fsthumb://), kept by scheme so the remote server can answer the same URLs over
 * plain HTTP: /x/<scheme>/<rest>  ⇔  <scheme>://<rest>.
 */
const handlers = new Map();
let installed = false;

function install(protocol) {
    if (installed) return;
    installed = true;
    const handle = protocol.handle.bind(protocol);
    protocol.handle = (scheme, fn) => { handlers.set(scheme, fn); return handle(scheme, fn); };
}

const SCHEMES = /^(library|mangaimg|mediacache|fsthumb):\/\//;

// Every app URL inside a value (results, event payloads) → its HTTP form, absolute
// (`base` = http://<host the device used>): the page treats "/…" as a disk path.
function rewrite(v, base = '', depth = 0) {
    if (typeof v === 'string') return SCHEMES.test(v) ? v.replace(SCHEMES, (m, s) => `${base}/x/${s}/`) : v;
    if (!v || typeof v !== 'object' || depth > 12) return v;
    if (Array.isArray(v)) return v.map(x => rewrite(x, base, depth + 1));
    if (Buffer.isBuffer(v) || ArrayBuffer.isView(v)) return v;
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = rewrite(x, base, depth + 1);
    return out;
}

module.exports = { install, get: (scheme) => handlers.get(scheme), rewrite, SCHEMES };
