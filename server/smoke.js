/**
 * Startup self-check, enabled with DARKFRAME_SMOKE=1 (see tools/smoke.js).
 * Waits for the app UI to render, lets it settle, then verifies the renderer
 * logged no errors. Prints one line
 *   SMOKE_RESULT {"ok":true,...}
 * and exits with 0 / 1, so a script can run the real app headless-ish and judge it.
 */
const { app } = require('electron');

const SETTLE_MS  = 3000;
const TIMEOUT_MS = 60000;

// Electron's own security advisories (e.g. CSP 'unsafe-inline' styles) are not app errors.
const IGNORED = [/Electron Security Warning/i];

function runSmokeCheck(win) {
    const errors = [];
    const wc = win.webContents;

    wc.on('console-message', (event) => {
        const { level, message = '' } = event;
        if (level !== 'error') return;
        if (IGNORED.some(re => re.test(message))) return;
        errors.push(String(message).slice(0, 500));
    });
    wc.on('render-process-gone', (_, details) => errors.push(`renderer gone: ${details?.reason}`));
    wc.on('preload-error', (_, __, error) => errors.push(`preload: ${error?.message}`));

    const finish = (result) => {
        console.log('SMOKE_RESULT ' + JSON.stringify(result));
        app.exit(result.ok ? 0 : 1);
    };

    const timer = setTimeout(() => finish({ ok: false, errors: ['timeout waiting for the window'] }), TIMEOUT_MS);

    const probeUi = () => wc.executeJavaScript(`({
        tabs: document.querySelectorAll('.nav-source-tab').length,
        root: !!document.querySelector('.main-root'),
        title: document.title,
    })`).catch(e => { errors.push('executeJavaScript: ' + e.message); return null; });

    // Called once loadFile() has resolved. Webpack chunks keep loading after that, so
    // poll until the app has rendered, then give it a moment to surface late errors.
    (async () => {
        let ui = null;
        const deadline = Date.now() + TIMEOUT_MS - SETTLE_MS - 1000;
        while (Date.now() < deadline) {
            ui = await probeUi();
            if (ui?.root && ui.tabs > 0) break;
            await new Promise(r => setTimeout(r, 300));
        }
        await new Promise(r => setTimeout(r, SETTLE_MS));
        clearTimeout(timer);
        const rendered = !!(ui?.root && ui.tabs > 0);
        if (!rendered) errors.push('app UI did not render');
        finish({ ok: rendered && errors.length === 0, ui, errors });
    })();

    wc.once('did-fail-load', (_, code, desc) => { errors.push(`did-fail-load ${code} ${desc}`); });
}

module.exports = { runSmokeCheck };
