const path = require('path');
const { app, Menu, Notification, Tray, nativeImage } = require('electron');

/**
 * System tray: the app can live there (setting "Сворачивать в трей при закрытии"),
 * paste the clipboard into the library without opening the window, and tells
 * about files the watched folders picked up while the window is hidden.
 */
const ASSETS = path.join(__dirname, '..', '..', 'assets');
let tray = null;
let win = null;
let quitting = false;
let hintShown = false;

const settings = () => require('../../data/settings');

function show() {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
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

function buildMenu() {
    return Menu.buildFromTemplate([
        { label: 'Открыть Darkframe', click: show },
        { label: 'Вставить из буфера в библиотеку', click: pasteToLibrary },
        { type: 'separator' },
        {
            label: 'Сворачивать в трей при закрытии',
            type: 'checkbox',
            checked: !!settings().CloseToTray,
            click: (item) => {
                require('../controllers/settingsController').setSetting('CloseToTray', item.checked);
                // The settings panel re-reads the config when opened.
            },
        },
        { type: 'separator' },
        { label: 'Выход', click: () => { quitting = true; app.quit(); } },
    ]);
}

function init(window) {
    win = window;
    const icon = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
    tray = new Tray(icon);
    tray.setToolTip('Darkframe');
    tray.setContextMenu(buildMenu());
    tray.on('click', () => (win.isVisible() && win.isFocused() ? win.hide() : show()));
    // Rebuild on open so the checkbox follows changes made in the settings panel.
    tray.on('right-click', () => tray.setContextMenu(buildMenu()));

    app.on('before-quit', () => { quitting = true; });
    win.on('close', (e) => {
        if (quitting || !settings().CloseToTray) return;
        e.preventDefault();
        win.hide();
        if (!hintShown) {
            hintShown = true;
            notify('Darkframe продолжает работать в трее — отслеживаемые папки, API расширения. Выход — через меню значка.');
        }
    });
}

// Watched folders: one summary per folder after a burst of imports, only when the
// window isn't in front (otherwise the library shows the new files itself).
const pendingByFolder = new Map();   // name → { count, timer }
function watchedImported(folderName) {
    const cur = pendingByFolder.get(folderName) || { count: 0, timer: null };
    cur.count++;
    clearTimeout(cur.timer);
    cur.timer = setTimeout(() => {
        pendingByFolder.delete(folderName);
        if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) return;
        notify(`Из «${folderName}» добавлено в библиотеку: ${cur.count}`);
    }, 3000);
    cur.timer.unref?.();
    pendingByFolder.set(folderName, cur);
}

function destroy() {
    tray?.destroy();
    tray = null;
}

module.exports = { init, destroy, watchedImported, show };
