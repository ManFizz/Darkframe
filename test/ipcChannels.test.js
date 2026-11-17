// The window and the main process talk over ~200 named IPC channels. A typo in a
// name (or a handler removed while the window still calls it) used to surface only
// when that button was pressed. These checks read the sources of both sides.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (!['node_modules', 'dist'].includes(e.name)) walk(p, out); }
        else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
    }
    return out;
}

// channel → [files], for literal channel names (template strings with ${} are skipped)
function collect(files, re) {
    const map = new Map();
    for (const f of files) {
        const src = fs.readFileSync(f, 'utf8');
        for (const m of src.matchAll(re)) {
            if (!map.has(m[1])) map.set(m[1], []);
            map.get(m[1]).push(path.relative(ROOT, f));
        }
    }
    return map;
}

const NAME = String.raw`['"\x60]([^'"\x60$]+)['"\x60]`;
const rx = (prefix) => new RegExp(prefix + String.raw`\(\s*` + NAME, 'g');

const windowFiles = walk(path.join(ROOT, 'src'));
const mainFiles = [...walk(path.join(ROOT, 'server')), path.join(ROOT, 'main.js'), path.join(ROOT, 'preload.js')];

const invoked = collect(windowFiles, rx(String.raw`\binvoke`));
const sent = collect(windowFiles, rx(String.raw`\.send`));
const listened = collect(windowFiles, rx(String.raw`\.on`));
const handled = collect(mainFiles, rx(String.raw`ipcMain\.handle`));
const received = collect(mainFiles, rx(String.raw`ipcMain\.on`));

// Handlers kept on purpose though the window doesn't call them (yet).
const UNUSED_OK = new Set([
    'library:generateMissingDisplays',   // maintenance: displays for HEIC & co.
]);

const missing = (from, to) => [...from].filter(([ch]) => !to.has(ch)).map(([ch, files]) => `${ch} (${[...new Set(files)].join(', ')})`);

test('the scan finds the channels at all', () => {
    assert.ok(invoked.size > 100, `invoked: ${invoked.size}`);
    assert.ok(handled.size > 100, `handled: ${handled.size}`);
});

test('every channel the window invokes has a handler in the main process', () => {
    assert.deepEqual(missing(invoked, handled), []);
});

test('every message the window sends has a listener in the main process', () => {
    assert.deepEqual(missing(sent, received), []);
});

test('every handler is used by the window (or listed as kept on purpose)', () => {
    const unused = [...handled.keys()].filter(ch => !invoked.has(ch) && !UNUSED_OK.has(ch));
    assert.deepEqual(unused, []);
});

test('no channel is handled twice (Electron throws on the second ipcMain.handle)', () => {
    const twice = [...handled].filter(([, files]) => files.length > 1).map(([ch, files]) => `${ch}: ${files.join(', ')}`);
    assert.deepEqual(twice, []);
});

test('every event the window listens to is named somewhere in the main process', () => {
    const mainText = mainFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const silent = [...listened.keys()]
        .filter(ch => ch.includes(':'))   // app channels are "area:event"; DOM events don't have a colon
        .filter(ch => !mainText.includes(`'${ch}'`) && !mainText.includes(`"${ch}"`) && !mainText.includes(`\`${ch}\``));
    assert.deepEqual(silent, []);
});
