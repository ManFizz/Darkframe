#!/usr/bin/env node
/**
 * Makes a fresh checkout buildable. Runs after `npm install` and before every bundle:
 *   1. data/settings.js and data/private.js are git-ignored (personal paths, API keys) —
 *      create them from the committed *.template files when missing. Existing files
 *      are never touched.
 *   2. Compile the SCSS entry points to src/css/*.css (git-ignored build artefacts
 *      that webpack.imports.js pulls in).
 *
 * Usage: node tools/prepare.js [--no-css]
 */
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const CONFIG_FILES = ['settings.js', 'private.js'];
const SCSS_ENTRIES = ['main', 'gallery-view', 'modal', 'sidebar', 'video-controls', 'library'];

function ensureConfigs() {
    for (const name of CONFIG_FILES) {
        const target   = path.join(ROOT, 'data', name);
        const template = `${target}.template`;
        if (fs.existsSync(target)) continue;
        if (!fs.existsSync(template)) throw new Error(`Missing template: data/${name}.template`);
        fs.copyFileSync(template, target);
        console.log(`[prepare] created data/${name} from template — edit it to taste`);
    }
}

function compileCss() {
    const sass = require('sass');
    const cssDir = path.join(ROOT, 'src', 'css');
    for (const entry of SCSS_ENTRIES) {
        const src = path.join(cssDir, `${entry}.scss`);
        const out = path.join(cssDir, `${entry}.css`);
        // `quietDeps` + silenced deprecations: the mixed-decls notices are noise here.
        const { css } = sass.compile(src, { style: 'expanded', quietDeps: true, logger: sass.Logger.silent });
        fs.writeFileSync(out, css);
    }
    console.log(`[prepare] compiled ${SCSS_ENTRIES.length} stylesheets`);
}

function main() {
    ensureConfigs();
    if (!process.argv.includes('--no-css')) compileCss();
}

if (require.main === module) {
    try { main(); }
    catch (e) { console.error('[prepare] failed:', e.message); process.exit(1); }
}

module.exports = { ensureConfigs, compileCss, SCSS_ENTRIES };
