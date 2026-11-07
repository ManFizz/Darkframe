/**
 * Filters for the duplicate finder. They narrow an already scanned result, so a
 * change is instant and needs no new scan. A group is shown or hidden as a whole:
 * the copy kept in it must not depend on the filters.
 */
const DEFAULT_FILTERS = {
    acrossCollections: false,     // copies live in at least two collections
    collection: 'all',            // the group touches this collection
    type: 'all',                  // all | image | gif | video
    minSize: 0,                   // bytes, by the biggest file of the group
    differentResolution: false,   // copies differ in pixels
};

const NO_COLLECTION = 'none';
const placeOf = (it) => (it.collectionId == null ? NO_COLLECTION : String(it.collectionId));

function typeOf(mimeType) {
    const mime = String(mimeType || '');
    if (mime.startsWith('video/')) return 'video';
    return mime === 'image/gif' ? 'gif' : 'image';
}

const distinct = (items, key) => new Set(items.map(key)).size;

function matches(group, f) {
    const { items } = group;
    if (f.acrossCollections && distinct(items, placeOf) < 2) return false;
    if (f.collection !== 'all' && !items.some(it => placeOf(it) === f.collection)) return false;
    if (f.type !== 'all' && !items.some(it => typeOf(it.mimeType) === f.type)) return false;
    if (f.minSize > 0 && !items.some(it => (it.size || 0) >= f.minSize)) return false;
    if (f.differentResolution && distinct(items, it => `${it.width}x${it.height}`) < 2) return false;
    return true;
}

const filterGroups = (groups, filters) => {
    const f = { ...DEFAULT_FILTERS, ...filters };
    return groups.filter(g => matches(g, f));
};

/** Collections present in the result, for the picker: { id, name, groups }. */
function collectionOptions(groups) {
    const byId = new Map();
    for (const g of groups) {
        for (const id of new Set(g.items.map(placeOf))) {
            const name = g.items.find(it => placeOf(it) === id).collectionName;
            const cur = byId.get(id) || { id, name, groups: 0 };
            cur.groups++;
            byId.set(id, cur);
        }
    }
    return [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
}

/** Totals of the shown groups; the first item of a group is the one kept. */
const summarize = (groups) => ({
    totalGroups: groups.length,
    totalItems: groups.reduce((n, g) => n + g.items.length, 0),
    reclaimable: groups.reduce((n, g) => n + g.items.slice(1).reduce((s, it) => s + (it.size || 0), 0), 0),
});

/**
 * Bulk marking of the shown groups. Without a collection: everything but the first
 * copy. With one: the copies in that collection, and a group that lives entirely
 * there keeps its first copy, so a group is never emptied.
 */
function planMarks(groups, collection = null) {
    const mark = [], unmark = [];
    for (const { items } of groups) {
        const inside = collection == null ? items.slice(1)
            : items.filter(it => placeOf(it) === collection);
        const doomed = new Set(inside.length === items.length ? items.slice(1) : inside);
        for (const it of items) (doomed.has(it) ? mark : unmark).push(it.id);
    }
    return { mark, unmark };
}

/** Shown groups in which every copy is marked: trashing them would leave nothing. */
const fullyMarked = (groups, selected) =>
    groups.filter(g => g.items.every(it => selected.has(it.id))).length;

module.exports = { DEFAULT_FILTERS, filterGroups, collectionOptions, summarize, planMarks, fullyMarked };
