const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ops = require('../server/services/ffmpegOps');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkframe-ffmpeg-'));
const src = path.join(dir, 'clip.mp4');

test.before(() => {
    // 4 s synthetic clip, 1 keyframe per second so fast trims have cut points.
    execFileSync(ffmpegPath, [
        '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=4',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '25', '-y', src,
    ]);
});
test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

test('helpers', () => {
    assert.equal(ops.timemarkToSec('00:01:02.50'), 62.5);
    assert.equal(ops.timemarkToSec(''), 0);
    assert.ok(ops.isUrl('https://x.y/a.mp4'));
    assert.equal(ops.isUrl('C:\\a.mp4'), false);
});

test('probe reads duration and size; missing files degrade gracefully', async () => {
    const meta = await ops.probe(src);
    assert.ok(Math.abs(meta.duration - 4) < 0.2, `duration ${meta.duration}`);
    assert.equal(meta.width, 320);
    assert.equal(meta.height, 240);
    assert.deepEqual(await ops.probe(path.join(dir, 'nope.mp4')), { duration: null, width: 0, height: 0 });
});

test('precise trim cuts to the requested range', async () => {
    const out = path.join(dir, 'precise.mp4');
    await ops.trimFile(src, out, { start: 1, end: 2.5, mode: 'precise' });
    const { duration } = await ops.probe(out);
    assert.ok(Math.abs(duration - 1.5) < 0.15, `duration ${duration}`);
});

test('fast trim (stream copy) produces a playable shorter file', async () => {
    const out = path.join(dir, 'fast.mp4');
    await ops.trimFile(src, out, { start: 1, end: 3, mode: 'fast' });
    const { duration, width } = await ops.probe(out);
    assert.equal(width, 320);
    assert.ok(duration > 1 && duration < 3.6, `duration ${duration}`);   // snaps to keyframes
});

test('frame capture and thumbnail at a timestamp', async () => {
    const frame = path.join(dir, 'frame.jpg');
    await ops.captureFrame(src, frame, 2);
    assert.ok(fs.statSync(frame).size > 1000);

    const thumb = path.join(dir, 'thumb.jpg');
    await ops.thumbAt(src, thumb, 1.2);
    assert.ok(fs.statSync(thumb).size > 500);
});

test('hashFile / replaceFile', async () => {
    const a = path.join(dir, 'a.bin');
    const b = path.join(dir, 'b.bin');
    fs.writeFileSync(a, 'new content');
    fs.writeFileSync(b, 'old content');
    const h = await ops.hashFile(a);
    assert.match(h, /^[0-9a-f]{64}$/);
    await ops.replaceFile(a, b);
    assert.equal(fs.readFileSync(b, 'utf8'), 'new content');
    assert.equal(fs.existsSync(a), false);
    assert.equal(await ops.hashFile(b), h);
});
