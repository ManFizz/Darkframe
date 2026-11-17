#!/usr/bin/env node
/**
 * Builds the single userscript from core/ and sites/: the modules (plain CommonJS)
 * are packed into one file with a tiny require(), and the header lists every
 * site's hosts (@match / @include), the hosts it talks to (@connect) and the GM
 * functions it needs (@grant).
 *
 * Sites: the ones listed in sites/index.js, plus every module in sites/private/
 * (kept out of git — sites you'd rather not have in the repository). Both are
 * joined into a generated module "sites/all.js".
 *
 *   node userscripts/build.js   → userscripts/dist/darkframe.user.js
 *
 * The app also serves a fresh build at http://127.0.0.1:45678/userscripts/darkframe.user.js
 * (the script's @updateURL), so an edit here reaches the browser on the next
 * update check — no file to copy by hand.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIRS = ['core', 'sites', 'sites/private'];
const GRANTS = ['GM_xmlhttpRequest', 'GM_getValue', 'GM_setValue', 'GM_registerMenuCommand'];
const UPDATE_URL = 'http://127.0.0.1:45678/userscripts/darkframe.user.js';

function sources() {
    const out = [];
    for (const dir of DIRS) {
        const abs = path.join(ROOT, dir);
        if (!fs.existsSync(abs)) continue;
        for (const f of fs.readdirSync(abs).sort()) {
            if (f.endsWith('.js')) out.push(`${dir}/${f}`);
        }
    }
    return out;
}

const privateSites = (files) => files.filter(f => f.startsWith('sites/private/'));

// The generated "sites/all.js": the listed sites, then the private ones.
function allSitesModule(files) {
    const extra = privateSites(files).map(f => `require(${JSON.stringify('./' + f.slice('sites/'.length))})`);
    return `module.exports = [...require('./index'), ${extra.join(', ')}];`;
}

// The module id a require() inside `from` points at ("../core/http" → "core/http.js").
function resolve(from, request) {
    const parts = path.posix.dirname(from).split('/').filter(p => p && p !== '.');
    for (const seg of request.split('/')) {
        if (seg === '..') parts.pop();
        else if (seg !== '.') parts.push(seg);
    }
    const id = parts.join('/');
    return id.endsWith('.js') ? id : `${id}.js`;
}

// The newest source change as a version: later edits always compare higher.
function version(files) {
    const t = new Date(Math.max(...files.map(f => fs.statSync(path.join(ROOT, f)).mtimeMs)));
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `1.${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}.${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`;
}

function header(files) {
    // The site modules only describe themselves at load time — safe to read here.
    for (const f of files) delete require.cache[path.join(ROOT, f)];
    const sites = [
        ...require(path.join(ROOT, 'sites', 'index.js')),
        ...privateSites(files).map(f => require(path.join(ROOT, f))),
    ];
    const hosts = [...new Set(sites.flatMap(s => s.hosts || []))];
    const include = [...new Set(sites.flatMap(s => s.include || []))];
    const connect = [...new Set(['127.0.0.1', ...sites.flatMap(s => s.connect || [])])];
    const grants = [...new Set([...GRANTS, ...sites.flatMap(s => s.grants || [])])];
    const lines = [
        ['name', 'Darkframe'],
        ['namespace', 'darkframe'],
        ['version', version(files)],
        ['description', `Скачивание в библиотеку Darkframe: ${sites.map(s => s.name).join(', ')}. Уже скачанное прячется.`],
        ...hosts.map(h => ['match', `https://${h}/*`]),
        ...include.map(r => ['include', r]),
        ...grants.map(g => ['grant', g]),
        ...connect.map(c => ['connect', c]),
        ['updateURL', UPDATE_URL],
        ['downloadURL', UPDATE_URL],
        ['run-at', 'document-idle'],
        ['noframes', ''],
    ];
    return ['// ==UserScript==', ...lines.map(([k, v]) => `// @${k.padEnd(12)} ${v}`.trimEnd()), '// ==/UserScript=='].join('\n');
}

function build() {
    const files = sources();
    const known = new Set([...files, 'sites/all.js']);
    const modules = [...files, 'sites/all.js'].map((id) => {
        const src = id === 'sites/all.js' ? allSitesModule(files) : fs.readFileSync(path.join(ROOT, id), 'utf8');
        for (const m of src.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
            const target = resolve(id, m[1]);
            if (!known.has(target)) throw new Error(`${id}: require('${m[1]}') — no module ${target} in ${DIRS.join(', ')}`);
        }
        return `${JSON.stringify(id)}: function (require, module, exports) {\n${src.trimEnd()}\n},`;
    });

    return `${header(files)}

// Built by userscripts/build.js from userscripts/core and userscripts/sites — edit those.
(function () {
'use strict';
const __defs = {
${modules.join('\n')}
};
const __cache = {};
function __resolve(from, request) {
    const parts = from.split('/').slice(0, -1);
    for (const seg of request.split('/')) {
        if (seg === '..') parts.pop();
        else if (seg !== '.') parts.push(seg);
    }
    const id = parts.join('/');
    return id.endsWith('.js') ? id : id + '.js';
}
function __load(id) {
    if (__cache[id]) return __cache[id].exports;
    const module = { exports: {} };
    __cache[id] = module;
    __defs[id]((request) => __load(__resolve(id, request)), module, module.exports);
    return module.exports;
}
__load('core/main.js').main();
})();
`;
}

module.exports = { build, resolve };

if (require.main === module) {
    const out = path.join(ROOT, 'dist', 'darkframe.user.js');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, build());
    console.log(`[userscripts] ${path.relative(process.cwd(), out)}`);
}
