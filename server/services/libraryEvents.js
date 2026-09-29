/**
 * Push notifications from the main process to every renderer window, so the UI can
 * follow library changes it didn't initiate itself (API / browser-extension imports,
 * moves made from one view while another shows the counts, long batch imports).
 *
 *   library:changed         { added, addedTo: [collectionId|null], counts: true }
 *   library:importActivity  { active, done, total, current, failed }
 */
const { BrowserWindow } = require('electron');
const Item = require('../models/Item');

function broadcast(channel, payload) {
    for (const win of BrowserWindow.getAllWindows()) {
        const wc = win.webContents;
        if (wc && !wc.isDestroyed()) wc.send(channel, payload);
    }
}

// ─── Item changes ─────────────────────────────────────────────────────────────
// Coalesced: a batch import or a bulk move fires one event, not one per row.
// The first change goes out quickly; during a steady stream at most one per second.

const FLUSH_DELAY = 250;
const MIN_GAP     = 1000;

let pending   = null;
let timer     = null;
let lastFlush = 0;

function flush() {
    timer = null;
    if (!pending) return;
    const payload = { added: pending.added, addedTo: [...pending.addedTo], counts: true };
    pending = null;
    lastFlush = Date.now();
    broadcast('library:changed', payload);
}

function itemsChanged({ added = 0, collectionId } = {}) {
    if (!pending) pending = { added: 0, addedTo: new Set() };
    if (added) {
        pending.added += added;
        pending.addedTo.add(collectionId ?? null);
    }
    if (timer) return;
    const wait = Math.max(FLUSH_DELAY, MIN_GAP - (Date.now() - lastFlush));
    timer = setTimeout(flush, wait);
}

// Fire only once the row is actually visible to other connections.
function afterCommit(options, fn) {
    if (options?.transaction?.afterCommit) options.transaction.afterCommit(fn);
    else fn();
}

// Fields whose change moves an item between the sidebar's counters.
const COUNTED_FIELDS = ['collectionId', 'deletedAt'];

let hooked = false;
function installItemHooks() {
    if (hooked) return;
    hooked = true;

    Item.addHook('afterCreate', 'libraryEvents', (item, options) =>
        afterCommit(options, () => itemsChanged({ added: 1, collectionId: item.collectionId })));

    Item.addHook('afterBulkCreate', 'libraryEvents', (items, options) =>
        afterCommit(options, () => items.forEach(i => itemsChanged({ added: 1, collectionId: i.collectionId }))));

    Item.addHook('afterUpdate', 'libraryEvents', (item, options) => {
        const fields = options?.fields || [];
        if (fields.some(f => COUNTED_FIELDS.includes(f))) afterCommit(options, () => itemsChanged());
    });

    Item.addHook('afterBulkUpdate', 'libraryEvents', (options) => {
        const fields = Object.keys(options?.attributes || {});
        if (fields.some(f => COUNTED_FIELDS.includes(f))) afterCommit(options, () => itemsChanged());
    });

    Item.addHook('afterDestroy', 'libraryEvents', (_, options) => afterCommit(options, () => itemsChanged()));
    Item.addHook('afterBulkDestroy', 'libraryEvents', (options) => afterCommit(options, () => itemsChanged()));
}

// ─── Import activity ──────────────────────────────────────────────────────────
// One aggregate counter across every import source running at once. Totals reset
// when everything has finished, so the next import starts again from 0 / N.

const activity = { jobs: 0, done: 0, total: 0, failed: 0, current: '' };
let activityTimer = null;

function sendActivity() {
    activityTimer = null;
    broadcast('library:importActivity', {
        active:  activity.jobs > 0,
        done:    activity.done,
        total:   activity.total,
        failed:  activity.failed,
        current: activity.current,
    });
    if (activity.jobs === 0) {
        activity.done = activity.total = activity.failed = 0;
        activity.current = '';
    }
}

function pushActivity(immediate = false) {
    if (immediate) {
        clearTimeout(activityTimer);
        sendActivity();
    } else if (!activityTimer) {
        activityTimer = setTimeout(sendActivity, 120);
    }
}

/**
 * Register `count` files that are about to be imported.
 *   const job = beginImport(n);  job.step(name) … job.fileDone(ok) … job.end();
 */
function beginImport(count) {
    activity.jobs++;
    activity.total += count;
    pushActivity(true);

    let ended = false;
    let left  = count;
    return {
        step(name) {
            activity.current = name || '';
            pushActivity();
        },
        fileDone(ok = true) {
            if (left <= 0) return;
            left--;
            activity.done++;
            if (!ok) activity.failed++;
            pushActivity();
        },
        end() {
            if (ended) return;
            ended = true;
            // Files never reached (errors before the loop) still count as finished.
            activity.done += left;
            left = 0;
            activity.jobs--;
            pushActivity(activity.jobs === 0);
        },
    };
}

// True while any import job is running (the library can't be switched then).
const importActive = () => activity.jobs > 0;

module.exports = { installItemHooks, itemsChanged, beginImport, broadcast, importActive };
