// Wiring: picks the site module for this page, builds the panel, decorates the
// site's items (hides saved ones, adds a button to each), runs the downloads.
//
// A site module (sites/*.js) describes only what is particular to its site:
//   id, name
//   hosts       — host names; "*.example.com" also takes every subdomain (and the
//                 bare domain only if listed too)
//   include?    — @include regexes for hosts no list can name (any TLD), with
//   test?(loc)  — the same check at run time
//   connect?, grants?   — extra @connect hosts / @grant functions
//   side?: 'right' | 'left', concurrency? (per-item buttons at once, default 1)
//   itemDelay?  — ms between items of a run, or a function returning it
//   settings?: [{ key, label, type: 'select' | 'checkbox', options?, default }]
//   page(location) → null (no panel here) | {
//       label, current? (id of the item this page shows), oneLabel?,
//       all? (label of "the whole list" — needs list()), visible? (true: "the ones on the page"),
//       actions?: [{ key, label, run(ctx) }]   — the site's own buttons
//   }   Called again as the page changes; the panel is rebuilt when it says something new.
//   items(page)        → [{ id, box, alsoHide?: [elements], mount?(button) }] shown on the page
//   sourceUrl(id)      → the link stored as the item's source (also asks the library)
//   save(id, ctx)      → { result, ids?, error?, reason? }   one item
//   list(page, ctx)    → the whole list of the page: for each batch
//                        `if (!(await ctx.take(entries))) return;` with entries [{ id, save() }]
//   decorate?()        — extra touches to the page, panel or not (called as it changes)
//   init?({ settings }) — once at start (e.g. to keep a setting the site reads later)

const { sleep } = require('./http');
const store = require('./store');
const app = require('./app');
const panel = require('./panel');
const runner = require('./runner');
const sites = require('../sites/all');

const RESULT_TEXT = {
    saved: '✓ сохранено', exists: '✓ уже есть', partial: '⚠ частично', failed: '✗ ошибка',
};

function hostMatches(pattern, hostname) {
    if (pattern.startsWith('*.')) return hostname.endsWith(pattern.slice(1));
    return hostname === pattern;
}
const siteFor = (loc) => sites.find(s => (s.test ? s.test(loc) : false) || (s.hosts || []).some(h => hostMatches(h, loc.hostname)));

// What a page description says, for "did it change?".
const signature = (p) => (p ? JSON.stringify([p.label, p.current, p.all, p.visible, p.oneLabel, (p.actions || []).map(a => a.label)]) : '');

function main() {
    const site = siteFor(location);
    if (!site) return;

    const st = store.siteStore(site.id);
    const settings = Object.fromEntries((site.settings || []).map(s => [s.key, st.setting(s.key, s.default)]));
    site.init?.({ settings });

    let page = null, pageSig = null, ui = null, appReady = false, busy = false, run = null;
    const asked = new Set();
    const buttons = new WeakMap();   // item box → its button

    const setStatus = (text) => { ui?.setStatus(text); console.log(`[DF-${site.id}]`, text); };

    const ctx = {
        settings,
        collectionId: () => st.collectionId(),
        status: setStatus,
        confirm: (text) => window.confirm(text),
        pause: () => sleep(runner.PAGE_DELAY),
        get run() { return run; },
        take: (entries) => runner.saveEntries(site, st, run, entries, refresh),
    };

    function askToken() {
        const v = prompt('Токен Darkframe (Панель управления → токены доступа, scope: import). Пусто — убрать токен.', store.token.get());
        if (v === null) return;
        store.token.set(v.trim());
        checkApp();
    }
    GM_registerMenuCommand('Darkframe: указать токен', askToken);
    GM_registerMenuCommand(`Darkframe: забыть, что скачано на ${site.name}`, () => {
        if (!confirm('Забыть локальный список скачанного? То, что уже есть в библиотеке, всё равно будет скрыто — это проверяет приложение.')) return;
        st.reset(); asked.clear(); refresh();
    });

    async function checkApp() {
        appReady = false;
        const problem = await app.check();
        if (problem) { setStatus(problem); return; }
        appReady = true;
        setStatus('Darkframe на связи. Скачанное скрыто.');
        loadCollections();
        refresh();
    }
    const loadCollections = () => app.collections().then(list => list && ui?.fillCollections(list));

    async function newCollection() {
        const name = prompt('Название новой коллекции:');
        if (!name || !name.trim()) return;
        try {
            const c = await app.createCollection(name.trim());
            st.collection.set(String(c.id));
            await loadCollections();
            setStatus(`Коллекция «${c.name}» создана и выбрана.`);
        } catch (e) { setStatus(`Коллекция не создана: ${e.message}`); }
    }

    function refresh() {
        try { site.decorate?.(); } catch (e) { console.warn(`[DF-${site.id}] decorate`, e); }
        if (!page || !ui) return;
        const items = site.items ? site.items(page) : [];
        const show = st.showDone.get();
        let saved = 0;
        for (const it of items) {
            const isSaved = st.isDone(it.id);
            const hide = isSaved && !show && it.id !== page.current;   // the item being viewed is only dimmed
            for (const e of [it.box, ...(it.alsoHide || [])]) e.classList.toggle('dfr-hidden', hide);
            it.box.classList.toggle('dfr-done', isSaved && !hide);
            if (isSaved) saved++;
            addButton(it);
            const btn = buttons.get(it.box);
            if (btn && isSaved && !btn.dataset.state) { btn.textContent = '✓ Darkframe'; btn.dataset.state = 'done'; }
        }
        ui.setHiddenCount(saved);
        if (page.current) ui.setLabel('one', st.isDone(page.current) ? '✓ Уже скачано' : (page.oneLabel || 'Скачать это'));

        const unknown = [...new Set(items.map(i => i.id).concat(page.current ? [page.current] : []))]
            .filter(id => !st.seen(id) && !asked.has(id));
        if (unknown.length && appReady) {
            unknown.forEach(id => asked.add(id));
            runner.libraryHas(site, st, unknown)
                .then(found => { if (found.size) refresh(); })
                .catch(e => setStatus(e.message));
        }
    }

    // Per-item buttons: clicks queue up; `site.concurrency` run at once.
    const queue = [];
    let active = 0;
    function pump() {
        while (active < (site.concurrency || 1) && queue.length) {
            const { id, btn } = queue.shift();
            active++;
            btn.textContent = '…';
            const one = runner.createRun({ setStatus });
            runner.saveOne(st, one, id, () => site.save(id, { ...ctx, run: one }))
                .then((out) => {
                    btn.textContent = out.result === 'skip' ? (out.reason || 'пропущено') : (RESULT_TEXT[out.result] || out.result);
                    btn.dataset.state = out.result;
                    setStatus(out.error ? `Ошибка: ${out.error}` : `${btn.textContent}${queue.length ? ` · в очереди ${queue.length}` : ''}`);
                    setTimeout(refresh, 1200);
                })
                .catch((err) => { btn.textContent = '✗ ошибка'; btn.dataset.state = 'failed'; setStatus(err.message); })
                .finally(() => { active--; pump(); });
        }
    }

    function addButton(it) {
        if (buttons.has(it.box)) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dfr-item-btn';
        btn.textContent = st.isDone(it.id) ? '✓ Darkframe' : '⬇ Darkframe';
        btn.title = 'Скачать в Darkframe';
        buttons.set(it.box, btn);
        btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (btn.dataset.state === 'queued' || btn.textContent === '…') return;
            btn.dataset.state = 'queued';
            btn.textContent = '⋯ в очереди';
            queue.push({ id: it.id, btn });
            pump();
        }, true);
        // Don't let the click through to the site (opening the item, starting playback).
        for (const ev of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart']) btn.addEventListener(ev, (e) => e.stopPropagation(), true);
        if (it.mount) it.mount(btn);
        else { it.box.classList.add('dfr-rel'); it.box.append(btn); }
    }

    async function start(kind) {
        if (busy || !page) return;
        busy = true;
        run = runner.createRun({ setStatus });
        ui.setRunning(true);
        try {
            const own = (page.actions || []).find(a => a.key === kind);
            if (own) {
                await own.run(ctx);
            } else if (kind === 'one') {
                run.c.seen = 1;
                const id = page.current;
                await runner.saveOne(st, run, id, () => site.save(id, ctx));
            } else if (kind === 'all') {
                await site.list(page, ctx);
            } else if (kind === 'visible') {
                const ids = [...new Set(site.items(page).map(i => i.id))];
                await ctx.take(ids.map(id => ({ id, save: () => site.save(id, ctx) })));
            }
            if (!own || !run.silent) run.report(run.stopped ? 'Остановлено. ' : 'Готово. ');
        } catch (e) {
            run.lastError = e.message;
            run.report('Прервано. ');
        } finally {
            busy = false;
            ui.setRunning(false);
            refresh();
        }
    }

    function onPage() {
        let next;
        try { next = site.page(location); } catch (e) { console.warn(`[DF-${site.id}] page`, e); next = null; }
        const sig = signature(next);
        if (sig === pageSig) return;
        pageSig = sig;
        page = next;
        if (!page) { document.getElementById('dfr-panel')?.remove(); ui = null; return; }
        const actions = [];
        if (page.current) actions.push({ key: 'one', label: page.oneLabel || 'Скачать это', primary: true });
        if (page.all) actions.push({ key: 'all', label: page.all, primary: !page.current });
        if (page.visible) actions.push({ key: 'visible', label: 'Скачать видимые', primary: !page.current && !page.all });
        for (const a of page.actions || []) actions.push({ key: a.key, label: a.label });
        ui = panel.build({
            side: site.side, title: page.label, actions, store: st,
            settings: (site.settings || []).map(s => ({ ...s, setting: settings[s.key] })),
            on: {
                action: start,
                stop: () => { if (run) run.stopped = true; setStatus('Останавливаю после текущего…'); },
                showDone: refresh,
                token: askToken,
                newCollection,
            },
        });
        ui.setRunning(busy);
        checkApp();
    }

    let pending = false;
    new MutationObserver((records) => {
        if (pending || records.every(r => ui?.panel.contains(r.target) || r.target.closest?.('.dfr-item-btn'))) return;
        pending = true;
        setTimeout(() => { pending = false; onPage(); refresh(); }, 400);
    }).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(onPage, 1000);
    onPage();
    refresh();
}

module.exports = { main, hostMatches, signature };
