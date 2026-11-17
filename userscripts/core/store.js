// What the script remembers (Violentmonkey storage of this one script, so it is
// shared by every site). Shared settings have plain keys; a site's own are
// prefixed with its id ("reddit.collectionId").

const { now } = require('./http');

function setting(key, def) {
    return { get: () => GM_getValue(key, def), set: (v) => GM_setValue(key, v) };
}

const token = setting('token', '');

// A site's settings and the list of what it already saved:
//   done:    id → unix time it was saved (or found in the library)
//   partial: id → true when some of its files failed — tried again next time
function siteStore(siteId) {
    const key = (name) => `${siteId}.${name}`;
    let done = GM_getValue(key('done'), {});
    let partial = GM_getValue(key('partial'), {});
    const save = () => { GM_setValue(key('done'), done); GM_setValue(key('partial'), partial); };

    const collection = setting(key('collectionId'), '');
    return {
        setting: (name, def) => setting(key(name), def),
        showDone: setting(key('showDone'), false),
        collection,
        collectionId() { const v = collection.get(); return /^\d+$/.test(v) ? Number(v) : (v || null); },
        isDone: (id) => !!done[id] && !partial[id],
        seen: (id) => !!done[id],
        markDone(id) { done[id] = now(); delete partial[id]; save(); },
        markPartial(id) { done[id] = now(); partial[id] = true; save(); },
        // The library has it: hidden from now on, unless a part is known missing.
        noteInLibrary(ids) { for (const id of ids) if (!done[id]) done[id] = now(); save(); },
        isPartial: (id) => !!partial[id],
        reset() { done = {}; partial = {}; save(); },
    };
}

module.exports = { token, siteStore };
