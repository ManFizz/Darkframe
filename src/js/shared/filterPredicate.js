// Library filter model + the predicate that applies it. Shared by the renderer (live
// navbar filter, quick presets) and the main process (smart collections), so both
// always agree on what a filter matches. CommonJS on purpose: required by node and
// imported by webpack alike.

const FILTER_DEFAULTS = {
    search:             '',
    tags:               [],       // [{ name, exclude }]
    ratingMin:          0,
    ratingMax:          10,       // 0..10; min=max=0 → "unrated only"
    types:              [],       // subset of ['image', 'video', 'gif']; empty = any
    sizeMin:            null,     // bytes
    sizeMax:            null,     // bytes
    minSide:            null,     // px — the shorter side must be at least this
    orientation:        'any',    // 'any' | 'portrait' | 'landscape' | 'square'
    importedWithinDays: null,     // relative window (stays "live")
    importedFrom:       null,     // unix seconds, inclusive
    importedTo:         null,     // unix seconds, inclusive
    noTags:             false,
    noCollection:       false,
};

const MEDIA_TYPES = ['image', 'video', 'gif'];
const ORIENTATIONS = ['any', 'portrait', 'landscape', 'square'];

const num = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));

// Fill in defaults and coerce types (saved smart filters predate most fields).
function normalizeFilter(f = {}) {
    const n = { ...FILTER_DEFAULTS, ...(f || {}) };
    n.search = String(n.search || '');
    n.tags = Array.isArray(n.tags)
        ? n.tags.filter(t => t && t.name).map(t => ({ name: String(t.name).toLowerCase(), exclude: !!t.exclude }))
        : [];
    n.ratingMin = Math.max(0, Math.min(10, num(n.ratingMin) ?? 0));
    n.ratingMax = Math.max(0, Math.min(10, num(n.ratingMax) ?? 10));
    n.types = Array.isArray(n.types) ? n.types.filter(t => MEDIA_TYPES.includes(t)) : [];
    n.sizeMin = num(n.sizeMin);
    n.sizeMax = num(n.sizeMax);
    n.minSide = num(n.minSide);
    n.orientation = ORIENTATIONS.includes(n.orientation) ? n.orientation : 'any';
    n.importedWithinDays = num(n.importedWithinDays);
    n.importedFrom = num(n.importedFrom);
    n.importedTo = num(n.importedTo);
    n.noTags = !!n.noTags;
    n.noCollection = !!n.noCollection;
    return n;
}

// 'video' | 'gif' | 'image' — works for renderer ThumbFiles (numeric type) and raw rows.
function mediaKind(item) {
    const mime = String(item.mimeType || '');
    if (mime.startsWith('video/') || item.type === 2) return 'video';
    if (mime === 'image/gif') return 'gif';
    return 'image';
}

function orientationOf(w, h) {
    if (!w || !h) return null;
    if (Math.abs(w - h) <= Math.max(w, h) * 0.05) return 'square';
    return h > w ? 'portrait' : 'landscape';
}

// How many "advanced" conditions (beyond search / tags / rating) are active.
function advancedCount(f) {
    let n = 0;
    if (f.types.length) n++;
    if (f.sizeMin != null || f.sizeMax != null) n++;
    if (f.minSide != null) n++;
    if (f.orientation !== 'any') n++;
    if (f.importedWithinDays != null || f.importedFrom != null || f.importedTo != null) n++;
    if (f.noTags) n++;
    if (f.noCollection) n++;
    return n;
}

function isFilterActive(f) {
    return !!(f.search.trim() || f.tags.length || f.ratingMin > 0 || f.ratingMax < 10 || advancedCount(f));
}

// Only the fields a smart collection needs to persist (drops sorting etc.).
function toSmartFilter(filters) {
    const f = normalizeFilter(filters);
    const out = {};
    for (const key of Object.keys(FILTER_DEFAULTS)) out[key] = f[key];
    return out;
}

/**
 * Does `item` pass filter `f` (already normalized)? `item.tags` is an array of names.
 * `isCollection` items (child-collection tiles in the grid) only take part in the
 * search/tag/rating filter and are hidden while any media-specific condition is on.
 */
function matchItem(item, f, nowSec = Math.floor(Date.now() / 1000)) {
    const isCollection = !!(item.isCollection || item._meta?.isCollection);
    if (isCollection && advancedCount(f)) return false;

    const q = f.search.trim().toLowerCase();
    if (q) {
        const title = String(item.title || '').toLowerCase();
        const file  = String(item.fileName || '').toLowerCase();
        if (!title.includes(q) && !file.includes(q)) return false;
    }

    const tags = Array.isArray(item.tags) ? item.tags : [];
    for (const t of f.tags) {
        const has = tags.includes(t.name);
        if (t.exclude ? has : !has) return false;
    }

    if (f.ratingMin > 0 || f.ratingMax < 10) {
        const r = item.rating || 0;
        if (r < f.ratingMin || r > f.ratingMax) return false;
    }

    if (isCollection) return true;

    if (f.types.length && !f.types.includes(mediaKind(item))) return false;

    const size = Number(item.size) || 0;
    if (f.sizeMin != null && size < f.sizeMin) return false;
    if (f.sizeMax != null && size > f.sizeMax) return false;

    const w = Number(item.width) || 0, h = Number(item.height) || 0;
    if (f.minSide != null && (!w || !h || Math.min(w, h) < f.minSide)) return false;
    if (f.orientation !== 'any' && orientationOf(w, h) !== f.orientation) return false;

    const at = Number(item.importedAt) || 0;
    if (f.importedWithinDays != null && at < nowSec - f.importedWithinDays * 86400) return false;
    if (f.importedFrom != null && at < f.importedFrom) return false;
    if (f.importedTo != null && at > f.importedTo) return false;

    if (f.noTags && tags.length) return false;
    if (f.noCollection && item.collectionId) return false;

    return true;
}

module.exports = {
    FILTER_DEFAULTS, MEDIA_TYPES, ORIENTATIONS,
    normalizeFilter, mediaKind, orientationOf, advancedCount, isFilterActive, toSmartFilter, matchItem,
};
