const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// MPEG-TS (.ts) videos: the folder viewer gets a cached MP4 twin, the library
// stores an MP4. Both via a lossless repack.
const S = sandbox.serverPath;
let ts;

test.before(async () => {
    await sandbox.initDb();
    ts = path.join(sandbox.dir, 'stream part 1.ts');
    execFileSync(require('ffmpeg-static'), ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440',
        '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'mpegts', '-y', ts], { stdio: 'ignore' });
});
test.after(() => sandbox.cleanup());

test('folder: a .ts plays through its MP4 twin, made once', async () => {
    const remux = require(S('services', 'remuxCache'));
    remux.setCacheDir(path.join(sandbox.dir, 'remux'));
    assert.ok(remux.needsRemux(ts));
    const [a, b] = await Promise.all([remux.playable(ts), remux.playable(ts)]);
    assert.equal(a, b);
    assert.ok(a.endsWith('.mp4') && fs.statSync(a).size > 0);
    const info = await require(S('services', 'ffmpegOps')).probe(a);
    assert.equal(info.width, 160);
    assert.ok(info.duration > 1.5);
    assert.equal(require(S('services', 'fsBrowser')).mediaKind(ts), 'video');
});

test('library: a .ts is imported as an MP4, the original stays', async () => {
    const { importFile } = require(S('services', 'importService'));
    const r = await importFile({ filePath: ts });
    assert.ok(r.item, JSON.stringify(r));
    assert.equal(r.item.mimeType, 'video/mp4');
    assert.match(r.item.fileName, /\.mp4$/);
    assert.equal(r.item.title, 'stream part 1');
    assert.ok(fs.existsSync(ts));
    const again = await importFile({ filePath: ts });
    assert.equal(again.skipped, true);
    assert.equal(again.filePath, ts, 'a duplicate points at the original file');
});
