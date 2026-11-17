#!/usr/bin/env node
/**
 * "Does a fresh checkout work?" — clones the repo into a temp folder and runs the
 * whole path a new machine would: npm ci → bundle → tests → smoke launch.
 *
 * Clones the committed HEAD of this working copy (uncommitted changes are NOT part
 * of the check — that's the point). Pass --remote to clone origin instead.
 * The temp folder is removed afterwards unless --keep is given.
 *
 * Usage: node tools/fresh-check.js [--remote] [--keep]
 */
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT   = path.resolve(__dirname, '..');
const remote = process.argv.includes('--remote');
const keep   = process.argv.includes('--keep');
const isWin  = process.platform === 'win32';

function step(title, cmd, args, cwd) {
    console.log(`\n=== ${title} ===`);
    const t0 = Date.now();
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin, env });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (res.status !== 0) {
        console.error(`\n[fresh-check] FAILED at "${title}" (${secs}s)`);
        return false;
    }
    console.log(`--- ok (${secs}s)`);
    return true;
}

function main() {
    const source = remote
        ? spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()
        : ROOT;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkframe-fresh-'));
    const repo = path.join(dir, 'repo');
    console.log(`[fresh-check] cloning ${source} → ${repo}`);

    const ok =
        step('git clone', 'git', ['clone', '--quiet', source, repo], dir) &&
        step('npm ci', 'npm', ['ci', '--no-audit', '--no-fund'], repo) &&
        step('bundle', 'npm', ['run', 'bundle'], repo) &&
        step('tests', 'npm', ['test'], repo) &&
        step('smoke launch', 'npm', ['run', 'smoke'], repo);

    if (keep) console.log(`[fresh-check] kept ${repo}`);
    else { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* files may be locked */ } }

    console.log(ok ? '\n[fresh-check] ALL GOOD — a fresh clone installs, builds, passes tests and starts.' : '');
    process.exit(ok ? 0 : 1);
}

main();
