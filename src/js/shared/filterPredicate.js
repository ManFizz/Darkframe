// Library filter model + the predicate that applies it. Shared by the renderer (live
// navbar filter, quick presets) and the main process (smart collections), so both
// always agree on what a filter matches. CommonJS on purpose: required by node and
// imported by webpack alike.

const FILTER_DEFAULTS = {
    search:             '',
    tags:               [],       // [{ name, exclude }]
    ratingMin:          0,
    ratingMax:          10,       // 0..10; min=max=0 → "unrated only"
    types:              [],       // subset of ['image', 'video', 'gif', 'manga']; empty = any
    sizeMin:            null,     // bytes
    sizeMax:            null,     // bytes
    minSide:            null,     // px — the shorter side must be at least this
    orientation:        'any',    // 'any' | 'portrait' | 'landscape' | 'square'
    importedWithinDays: null,     // relative window (stays "live")
    importedFrom:       null,     // unix seconds, inclusive
    importedTo:         null,     // unix seconds, inclusive
    noTags:             false,
    noCollection:       false,
    // Smart collections 2.0: a tree of "all / any" groups of conditions, AND-ed with
    // the flat fields above. { op: 'all'|'any', items: [condition | group] }
    rules:              null,
};

// { field, cmp, value }. `viewed` needs a context with the last-view time per item
// (ctx.lastViewed: Map id → unix seconds) — only smart collections (server) have it.
const RULE_FIELDS = ['tag', 'title', 'source', 'rating', 'type', 'size', 'duration',
    'width', 'height', 'minSide', 'orientation', 'imported', 'collection', 'viewed'];

function normalizeRules(r, depth = 0) {
    if (!r || typeof r !== 'object' || depth > 4) return null;
    const op = r.op === 'any' ? 'any' : 'all';
    const items = (Array.isArray(r.items) ? r.items : [])
        .map(x => (x && Array.isArray(x.items) ? normalizeRules(x, depth + 1)
            : x && RULE_FIELDS.includes(x.field) ? { field: x.field, cmp: String(x.cmp || ''), value: x.value ?? '' } : null))
        .filter(Boolean);
    return { op, items };
}

const hostOf = (url) => {
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
};

function cmpNum(v, cmp, x) {
    if (x === '' || x == null || !isFinite(Number(x))) return true;   // unfinished condition
    x = Number(x);
    if (cmp === 'lte') return v <= x;
    if (cmp === 'eq') return v === x;
    return v >= x;
}

function matchCondition(item, c, nowSec, ctx) {
    const v = c.value;
    const tags = Array.isArray(item.tags) ? item.tags : [];
    switch (c.field) {
        case 'tag': {
            const t = String(v).trim().toLowerCase();
            if (!t) return true;
            return c.cmp === 'not' ? !tags.includes(t) : tags.includes(t);
        }
        case 'title': {
            const q = String(v).trim().toLowerCase();
            if (!q) return true;
            const hay = `${item.title || ''} ${item.fileName || ''}`.toLowerCase();
            return c.cmp === 'not' ? !hay.includes(q) : hay.includes(q);
        }
        case 'source': {
            const host = hostOf(item.sourceUrl);
            if (c.cmp === 'empty') return !item.sourceUrl;
            if (c.cmp === 'present') return !!item.sourceUrl;
            const q = String(v).trim().toLowerCase().replace(/^www\./, '');
            if (!q) return true;
            if (c.cmp === 'not') return !(host === q || host.endsWith(`.${q}`));
            return host === q || host.endsWith(`.${q}`);
        }
        case 'rating':   return cmpNum(item.rating || 0, c.cmp, v);
        case 'size':     return cmpNum((Number(item.size) || 0) / (1024 * 1024), c.cmp, v);
        case 'duration': return cmpNum(Number(item.duration) || 0, c.cmp, v);
        case 'width':    return cmpNum(Number(item.width) || 0, c.cmp, v);
        case 'height':   return cmpNum(Number(item.height) || 0, c.cmp, v);
        case 'minSide':  return cmpNum(Math.min(Number(item.width) || 0, Number(item.height) || 0), c.cmp, v);
        case 'type': {
            if (!v) return true;
            return c.cmp === 'not' ? mediaKind(item) !== v : mediaKind(item) === v;
        }
        case 'orientation': {
            if (!v) return true;
            return orientationOf(Number(item.width) || 0, Number(item.height) || 0) === v;
        }
        case 'imported': {
            const days = Number(v);
            if (!isFinite(days) || v === '') return true;
            const at = Number(item.importedAt) || 0;
            return c.cmp === 'older' ? at < nowSec - days * 86400 : at >= nowSec - days * 86400;
        }
        case 'collection': {
            if (c.cmp === 'none') return !item.collectionId;
            if (!v) return true;
            return c.cmp === 'not' ? item.collectionId !== v : item.collectionId === v;
        }
        case 'viewed': {
            if (!ctx?.lastViewed) return true;   // no history available → don't filter
            const last = ctx.lastViewed.get(item.id) || 0;
            if (c.cmp === 'never') return !last;
            const days = Number(v);
            if (!isFinite(days) || v === '') return true;
            const recent = last >= nowSec - days * 86400;
            return c.cmp === 'not_within' ? !recent : recent;
        }
        default: return true;
    }
}

function matchRules(item, group, nowSec, ctx) {
    if (!group || !group.items.length) return true;
    const test = (x) => (x.items ? matchRules(item, x, nowSec, ctx) : matchCondition(item, x, nowSec, ctx));
    return group.op === 'any' ? group.items.some(test) : group.items.every(test);
}

// Does the rule tree reference view history (the server then loads it)?
function rulesNeedHistory(group) {
    if (!group) return false;
    return group.items.some(x => (x.items ? rulesNeedHistory(x) : x.field === 'viewed'));
}

const MEDIA_TYPES = ['image', 'video', 'gif', 'manga'];
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
    n.rules = normalizeRules(n.rules);
    return n;
}

// 'video' | 'gif' | 'image' | 'manga' — works for renderer ThumbFiles (numeric type) and raw rows.
function mediaKind(item) {
    const mime = String(item.mimeType || '');
    if (mime === 'application/x-darkframe-manga') return 'manga';
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
    if (f.rules?.items?.length) n++;
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
function matchItem(item, f, nowSec = Math.floor(Date.now() / 1000), ctx = null) {
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

    if (f.rules && !matchRules(item, f.rules, nowSec, ctx)) return false;

    return true;
}

module.exports = {
    FILTER_DEFAULTS, MEDIA_TYPES, ORIENTATIONS,
    normalizeFilter, mediaKind, orientationOf, advancedCount, isFilterActive, toSmartFilter, matchItem,
    RULE_FIELDS, normalizeRules, matchRules, matchCondition, rulesNeedHistory,
};
