/**
 * Static checks over the source tree:
 *  - every relative require()/import resolves to a file whose name matches the
 *    on-disk case exactly. Windows resolves './models/tag' to Tag.js, but Node then
 *    caches it under a second key and loads the module twice; on a case-sensitive
 *    FS it would not resolve at all.
 *  - every server module can actually be loaded (missing deps, typos, cycles).
 */
const sandbox = require('./helpers/sandbox');   // fake electron for the load check
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = sandbox.ROOT;
const SCAN = ['main.js', 'server', 'src/js', 'tools'];
const EXTS = ['', '.js', '.jsx', '.json', '/index.js', '/index.jsx'];

function walk(p, out = []) {
    const abs = path.join(ROOT, p);
    const st = fs.statSync(abs);
    if (st.isFile()) { if (/\.(jsx?|cjs)$/.test(p)) out.push(abs); return out; }
    for (const e of fs.readdirSync(abs)) {
        if (e === 'node_modules') continue;
        walk(path.join(p, e), out);
    }
    return out;
}

// Does `abs` exist with exactly this case, segment by segment?
function existsExactCase(abs) {
    const rel = path.relative(ROOT, abs);
    if (rel.startsWith('..')) return fs.existsSync(abs);
    let cur = ROOT;
    for (const seg of rel.split(path.sep)) {
        if (!fs.existsSync(cur) || !fs.statSync(cur).isDirectory()) return false;
        if (!fs.readdirSync(cur).includes(seg)) return false;
        cur = path.join(cur, seg);
    }
    return true;
}

const ALIASES = {
    '@/': 'src/js/', '@data/': 'data/', '@server/': 'server/', '@react/': 'src/js/React/',
    '@hooks/': 'src/js/Hooks/', '@services/': 'src/js/Services/',
    '@controllers/': 'src/js/Controllers/', '@modules/': 'src/js/modules/',
};

test('relative requires/imports match on-disk file name case', () => {
    const re = /(?:require\(\s*|import\s*\(\s*|from\s+|import\s+)['"]([^'"]+)['"]/g;
    const problems = [];
    for (const file of walk('.').length ? SCAN.flatMap(p => walk(p)) : []) {
        const code = fs.readFileSync(file, 'utf8');
        for (const [, spec] of code.matchAll(re)) {
            let base = null;
            if (spec.startsWith('.')) base = path.resolve(path.dirname(file), spec);
            else {
                const alias = Object.keys(ALIASES).find(a => spec.startsWith(a));
                if (alias) base = path.join(ROOT, ALIASES[alias], spec.slice(alias.length));
            }
            if (!base) continue;                                  // package import
            if (/[\\/]data[\\/](settings|private)(\.js)?$/.test(base)) continue;   // generated from templates
            const hit = EXTS.map(e => base + e).find(p => fs.existsSync(p) && fs.statSync(p).isFile());
            if (!hit) { problems.push(`${path.relative(ROOT, file)}: cannot resolve '${spec}'`); continue; }
            if (!existsExactCase(hit)) problems.push(`${path.relative(ROOT, file)}: '${spec}' differs in case from the file on disk`);
        }
    }
    assert.deepEqual(problems, []);
});

test('every server module loads', async () => {
    await sandbox.initDb();
    const failures = [];
    for (const file of walk('server')) {
        try { require(file); } catch (e) { failures.push(`${path.relative(ROOT, file)}: ${e.message}`); }
    }
    assert.deepEqual(failures, []);
});

test.after(() => sandbox.cleanup());
