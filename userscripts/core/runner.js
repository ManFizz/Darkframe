// Saving items one after another: skips what's already there, counts, reports,
// stops on request. Shared by the bulk buttons and the per-item buttons.

const { sleep } = require('./http');
const app = require('./app');

const ITEM_DELAY = 400;    // between items (the app downloads from the site's CDN)
const PAGE_DELAY = 1500;   // between pages of a list (the site's own API)

// The pause after an item: the site's own (a number, or a function — e.g. from a
// setting, with jitter), else the default.
const itemDelay = (site) => (typeof site.itemDelay === 'function' ? site.itemDelay() : (site.itemDelay ?? ITEM_DELAY));

// Which of these ids the library has (by the site's source link) → Set of ids.
// What it has is remembered as saved; an id known to be partial stays out.
async function libraryHas(site, store, ids) {
    const urlOf = new Map(ids.map(id => [site.sourceUrl(id), id]));
    if (!urlOf.size) return new Set();
    const present = await app.has([...urlOf.keys()]);
    const found = [...present].map(u => urlOf.get(u)).filter(Boolean);
    store.noteInLibrary(found);
    return new Set(found.filter(id => !store.isPartial(id)));
}

// One run of the panel. `report(prefix)` puts the counters into the status line.
function createRun({ setStatus }) {
    const c = { seen: 0, saved: 0, exists: 0, already: 0, partial: 0, failed: 0, page: 0, pages: null, skips: new Map() };
    const run = {
        c, stopped: false, lastError: '',
        report(prefix = '') {
            const skips = [...c.skips].map(([reason, n]) => ` · ${reason} ${n}`).join('');
            setStatus(`${prefix}${c.page ? `Стр. ${c.page}${c.pages ? ` из ${c.pages}` : ''} · ` : ''}просмотрено ${c.seen}`
                + ` · сохранено ${c.saved} · уже было ${c.already + c.exists}`
                + (c.partial ? ` · частично ${c.partial}` : '') + (c.failed ? ` · ошибок ${c.failed}` : '') + skips
                + (run.lastError ? `\nПоследняя ошибка: ${run.lastError}` : ''));
        },
        skip(reason, n = 1) { c.skips.set(reason, (c.skips.get(reason) || 0) + n); },
    };
    return run;
}

// The outcome of saving one item → the store and the counters.
// out: { result: 'saved' | 'exists' | 'partial' | 'failed' | 'skip', ids?, error?, reason? }
function record(store, run, id, out) {
    const ids = out.ids?.length ? out.ids : [id];
    if (out.result === 'saved' || out.result === 'exists') ids.forEach(x => store.markDone(x));
    if (out.result === 'partial') store.markPartial(id);
    if (out.error) run.lastError = out.error;
    if (out.result === 'skip') run.skip(out.reason || 'пропущено');
    else if (out.result in run.c) run.c[out.result]++;
}

async function saveOne(store, run, id, save) {
    let out;
    try { out = await save(); }
    catch (e) {
        if (e instanceof app.AppError) throw e;
        console.warn('[DF]', id, e);
        out = { result: 'failed', error: e.message };
    }
    record(store, run, id, out);
    return out;
}

/**
 * Saves `entries` ([{ id, save() }]) in order, skipping what's saved or already in
 * the library. → false once the run is stopped (the caller stops listing).
 */
async function saveEntries(site, store, run, entries, onEach = () => {}) {
    const inLibrary = await libraryHas(site, store, entries.map(e => e.id).filter(id => !store.isDone(id)));
    for (const e of entries) {
        if (run.stopped) return false;
        run.c.seen++;
        if (store.isDone(e.id) || inLibrary.has(e.id)) { run.c.already++; continue; }
        await saveOne(store, run, e.id, e.save);
        run.report();
        onEach();
        await sleep(itemDelay(site));
    }
    return !run.stopped;
}

module.exports = { ITEM_DELAY, PAGE_DELAY, itemDelay, libraryHas, createRun, record, saveOne, saveEntries };
