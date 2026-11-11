const fs = require('fs');
const path = require('path');
const util = require('util');

/**
 * The log file: <userData>/logs/darkframe.log (the previous one as darkframe.log.1
 * once it passes MAX_BYTES). Gets warnings and errors of the main process (console
 * stays as it was, this is a copy), anything thrown and not caught, crashed
 * renderer / GPU processes, and errors the window reports (ErrorBoundary,
 * window.onerror) over 'app:logError'.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_RENDERER_TEXT = 10000;

let file = null;
let stream = null;
let size = 0;

function open(dir) {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, 'darkframe.log');
    try { size = fs.statSync(file).size; } catch { size = 0; }
    if (size > MAX_BYTES) rotate();
    else stream = fs.createWriteStream(file, { flags: 'a' });
}

function rotate() {
    try { stream?.end(); } catch { /* closing anyway */ }
    try { fs.renameSync(file, `${file}.1`); } catch { /* nothing to move */ }
    stream = fs.createWriteStream(file, { flags: 'a' });
    size = 0;
}

const format = (args) => args.map(a => (a instanceof Error ? (a.stack || a.message) : typeof a === 'string' ? a : util.inspect(a, { depth: 4 }))).join(' ');

function write(level, args) {
    if (!stream) return;
    const line = `${new Date().toISOString()} ${level.padEnd(5)} ${format(args)}\n`;
    stream.write(line);
    size += Buffer.byteLength(line);
    if (size > MAX_BYTES) rotate();
}

// An error the window reports: { message, stack?, componentStack?, source? }
function fromRenderer(entry = {}) {
    const text = [entry.source && `[${entry.source}]`, entry.message, entry.stack, entry.componentStack]
        .filter(Boolean).map(String).join('\n').slice(0, MAX_RENDERER_TEXT);
    write('VIEW', [text || 'unknown error']);
}

let installed = false;
function install({ dir } = {}) {
    if (installed) return;
    installed = true;
    const { app, ipcMain } = require('electron');
    open(dir || path.join(app.getPath('userData'), 'logs'));

    for (const level of ['warn', 'error']) {
        const original = console[level].bind(console);
        console[level] = (...args) => { original(...args); write(level.toUpperCase(), args); };
    }

    // Logged, and the app carries on: one failed background job shouldn't take
    // the library down with it.
    process.on('uncaughtException', (e) => { write('FATAL', ['Uncaught exception:', e]); console.log(e); });
    process.on('unhandledRejection', (reason) => { write('ERROR', ['Unhandled rejection:', reason]); });

    app.on('render-process-gone', (_e, wc, details) => write('ERROR', [`Window process gone (${details.reason}, code ${details.exitCode}): ${wc?.getURL?.() || ''}`]));
    app.on('child-process-gone', (_e, details) => write('ERROR', [`Child process gone: ${details.type} (${details.reason}, code ${details.exitCode})`]));

    ipcMain.on('app:logError', (_e, entry) => fromRenderer(entry && typeof entry === 'object' ? entry : { message: String(entry) }));
    write('INFO', [`Darkframe started (Electron ${process.versions.electron})`]);
}

module.exports = { install, write, fromRenderer, logFile: () => file, MAX_BYTES, _open: open };
