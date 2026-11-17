#!/usr/bin/env node
/**
 * Runs test/*.test.js with `node --test` on Electron's bundled Node (ELECTRON_RUN_AS_NODE),
 * i.e. the same runtime and native-module ABI the app's main process uses — the system
 * Node may be older (e.g. can't require() the ESM-only uuid).
 *
 * Usage: node tools/run-tests.js [file-filter]
 */
const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TEST_DIR = path.join(ROOT, 'test');

const filter = process.argv[2];
const files = fs.readdirSync(TEST_DIR)
    .filter(f => f.endsWith('.test.js'))
    .filter(f => !filter || f.includes(filter))
    .map(f => path.join('test', f));

if (!files.length) {
    console.error('[test] no test files matched');
    process.exit(1);
}

const electron = require('electron');   // path to the binary in plain node
const res = spawnSync(electron, ['--test', ...files], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
process.exit(res.status ?? 1);
