#!/usr/bin/env node
/**
 * Launch the built app (dist/) against a throw-away library and check that it starts:
 * DB created + migrated from scratch, window loaded, UI rendered, no console errors.
 *
 * Fully isolated: its own --user-data-dir with a libraries.json pointing into a temp
 * folder, so it never opens the real library (the default registry falls back to the
 * project's data/data.db) and can run while the app itself is open.
 *
 * Usage: node tools/smoke.js            (run `npm run bundle` first)
 *        node tools/smoke.js --shot=ui.png [--theme=light]   also save a picture of the window
 */
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function makeSandbox() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkframe-smoke-'));
    const userData = path.join(dir, 'userData');
    const lib = path.join(dir, 'library');
    fs.mkdirSync(userData, { recursive: true });
    fs.mkdirSync(path.join(lib, 'items'), { recursive: true });
    fs.writeFileSync(path.join(userData, 'libraries.json'), JSON.stringify({
        libraries: [{ id: 'smoke', name: 'Smoke', dbPath: path.join(lib, 'library.db'), itemsPath: path.join(lib, 'items') }],
        activeId: 'smoke',
    }, null, 2));
    return { dir, userData };
}

function run() {
    if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
        console.error('[smoke] dist/index.html missing — run `npm run bundle` first');
        process.exit(1);
    }

    const electron = require('electron');   // in plain node: path to the binary
    const { dir, userData } = makeSandbox();

    return new Promise((resolve) => {
        // Electron treats ELECTRON_RUN_AS_NODE as set even when empty — drop it entirely.
        const env = { ...process.env, DARKFRAME_SMOKE: '1' };
        const arg = (name) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
        if (arg('shot')) env.DARKFRAME_SMOKE_SHOT = path.resolve(arg('shot'));
        if (arg('theme')) env.DARKFRAME_SMOKE_THEME = arg('theme');
        delete env.ELECTRON_RUN_AS_NODE;

        const child = spawn(electron, ['.', `--user-data-dir=${userData}`], {
            cwd: ROOT,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let out = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { out += d; });

        const kill = setTimeout(() => child.kill(), 90000);

        child.on('exit', (code) => {
            clearTimeout(kill);
            const line = out.split(/\r?\n/).find(l => l.startsWith('SMOKE_RESULT '));
            let result = null;
            try { result = line && JSON.parse(line.slice('SMOKE_RESULT '.length)); } catch { /* keep null */ }

            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* files may be locked briefly */ }

            if (result?.ok && code === 0) {
                console.log(`[smoke] OK — UI rendered (${result.ui.tabs} source tabs), no console errors`);
                resolve(0);
            } else {
                console.error('[smoke] FAILED', result ? JSON.stringify(result, null, 2) : `(exit ${code}, no result)`);
                console.error(out.split(/\r?\n/).slice(-30).join('\n'));
                resolve(1);
            }
        });
    });
}

if (require.main === module) run().then(code => process.exit(code));

module.exports = { run };
