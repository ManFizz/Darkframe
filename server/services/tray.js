const path = require('path');
const { app, Menu, Notification, Tray, nativeImage, shell } = require('electron');

/**
 * Background mode. The app lives in the system tray: the window can be closed
 * (setting "minimize to tray on close") or never opened at all (autostart), while
 * the extension API, the phone server, watched folders and manga downloads keep
 * working. A window hidden for a while is destroyed to give its memory back and is
 * created again on demand. While the window is hidden, finished background work
 * (imports, new chapters) is reported with a notification.
 */
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const FREE_AFTER_MS = 10 * 60 * 1000;

let tray = null;
let getWindow = () => null;
let ensureWindow = async () => null;
let quitting = false;
let freed = false;          // the window was destroyed on purpose: stay alive
let hintShown = false;
let idleTimer = null;

const settings = () => require('../../data/settings');

async function show() {
    const win = await ensureWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
}

function windowInFront() {
    const win = getWindow();
    return !!win && !win.isDestroyed() && win.isVisible() && win.isFocused();
}

function notify(body, onClick = show) {
    if (!Notification?.isSupported?.()) return;
    const n = new Notification({ title: 'Darkframe', body, icon: path.join(ASSETS, 'icon.png'), silent: true });
    n.on('click', onClick);
    n.show();
}

async function pasteToLibrary() {
    try {
        const { pasteImport } = require('./pasteImport');
        const res = await pasteImport({ collectionId: null });
        const added = res.results.length;
        notify(!res.kind ? 'В буфере нет картинки, ссылки или файлов'
            : res.kind === 'manga' ? `Манга в очереди загрузки: ${res.manga.length}`
            : added ? `Добавлено в библиотеку: ${added}${res.skipped.length ? ` · уже было: ${res.skipped.length}` : ''}`
            : res.skipped.length ? 'Уже есть в библиотеке'
            : String(res.errors[0]?.error || 'Не удалось добавить'));
    } catch (e) {
        notify(`Не удалось добавить: ${e.message}`);
    }
}

async function checkSubscriptions() {
    try {
        const res = await require('./manga/subscriptions').checkAll({ reason: 'tray' });
        if (res.busy) notify('Проверка подписок уже идёт');
        else if (!res.checked) notify('Подписок на мангу нет');
        else if (!res.items.length) notify(`Новых глав нет (проверено: ${res.checked})`);
    } catch (e) {
        notify(`Не удалось проверить подписки: ${e.message}`);
    }
}

function setFlag(key, value) {
    require('../controllers/settingsController').setSetting(key, value);
}

function statusLines() {
    const lines = [];
    try {
        lines.push(`Расширения: 127.0.0.1:${require('../apiServer').PORT}`);
        const remote = require('../remote/server').status();
        if (remote.running) {
            const n = remote.connected.length;
            lines.push(`Телефон: порт ${remote.runningPort}${n ? ` · подключено: ${n}` : ''}`);
        }
    } catch { /* not started yet */ }
    return lines;
}

function buildMenu() {
    const autostart = require('./autostart');
    return Menu.buildFromTemplate([
        { label: 'Открыть Darkframe', click: show },
        ...statusLines().map(label => ({ label, enabled: false })),
        { type: 'separator' },
        { label: 'Вставить из буфера в библиотеку', click: pasteToLibrary },
        { label: 'Проверить подписки на мангу', click: checkSubscriptions },
        { label: 'Открыть папку библиотеки', click: () => shell.openPath(require('../libraryRegistry').getActive().itemsPath) },
        { type: 'separator' },
        {
            label: 'Сворачивать в трей при закрытии',
            type: 'checkbox',
            checked: !!settings().CloseToTray,
            click: (item) => setFlag('CloseToTray', item.checked),
        },
        {
            label: 'Запускать вместе с Windows',
            type: 'checkbox',
            checked: !!settings().StartWithWindows,
            visible: autostart.supported(),
            click: (item) => setFlag('StartWithWindows', item.checked),
        },
        { type: 'separator' },
        { label: 'Выход', click: () => { quitting = true; app.quit(); } },
    ]);
}

function scheduleFree() {
    clearTimeout(idleTimer);
    const tick = () => {
        const win = getWindow();
        if (!win || win.isDestroyed() || win.isVisible()) return;
        if (require('./libraryEvents').importActive()) { idleTimer = setTimeout(tick, 60 * 1000); idleTimer.unref?.(); return; }
        freed = true;
        win.destroy();
    };
    idleTimer = setTimeout(tick, FREE_AFTER_MS);
    idleTimer.unref?.();
}

/** Called for every window the app creates. */
function attach(win) {
    freed = false;
    win.on('close', (e) => {
        if (quitting || !settings().CloseToTray) return;
        e.preventDefault();
        win.hide();
        if (!hintShown) {
            hintShown = true;
            //notify('Darkframe продолжает работать в трее');
        }
    });
    win.on('hide', scheduleFree);
    win.on('show', () => clearTimeout(idleTimer));
    win.on('closed', () => clearTimeout(idleTimer));
}

/** `get` returns the current window or null; `ensure` creates it when missing. */
function init({ get, ensure }) {
    getWindow = get;
    ensureWindow = ensure;
    const icon = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
    tray = new Tray(icon);
    tray.setToolTip('Darkframe');
    tray.setContextMenu(buildMenu());
    tray.on('click', () => {
        const win = getWindow();
        if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) win.hide();
        else show();
    });
    // Rebuilt on open so the checkboxes and status follow the current state.
    tray.on('right-click', () => tray.setContextMenu(buildMenu()));
    app.on('before-quit', () => { quitting = true; });
}

/** True while the app should outlive its last window. */
const keepAlive = () => !!tray && !quitting && freed;

// One summary per source after a burst of imports, only when the window isn't in front.
const pending = new Map();   // source → { count, timer }
function imported(from) {
    const cur = pending.get(from) || { count: 0, timer: null };
    cur.count++;
    clearTimeout(cur.timer);
    cur.timer = setTimeout(() => {
        pending.delete(from);
        if (windowInFront()) return;
        notify(`Добавлено в библиотеку (${from}): ${cur.count}`);
    }, 3000);
    cur.timer.unref?.();
    pending.set(from, cur);
}

/** Manga subscriptions: new chapters found while nobody looks at the window. */
function mangaUpdates(items) {
    if (!items.length || windowInFront()) return;
    const chapters = items.reduce((s, i) => s + i.added, 0);
    notify(items.length === 1
        ? `Новые главы: ${items[0].added} — ${items[0].title}`
        : `Новые главы: ${chapters} (манга: ${items.length})`);
}

function destroy() {
    tray?.destroy();
    tray = null;
}

module.exports = { init, attach, destroy, imported, mangaUpdates, keepAlive, show };
