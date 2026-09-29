const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fileResponse, parseRange } = require('../server/fileResponse');

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'darkframe-range-')), 'clip.mp4');
fs.writeFileSync(file, Buffer.from('0123456789'));

test('range parsing: open-ended, suffix, clamped, invalid', () => {
    assert.deepEqual(parseRange('bytes=2-', 10), { start: 2, end: 9 });
    assert.deepEqual(parseRange('bytes=-3', 10), { start: 7, end: 9 });
    assert.deepEqual(parseRange('bytes=4-99', 10), { start: 4, end: 9 });
    assert.equal(parseRange('bytes=20-', 10), 'invalid');
    assert.equal(parseRange('items=1-2', 10), null);
});

test('206 with the requested slice; 200 without Range; 416 out of range', async () => {
    const part = fileResponse(file, 'bytes=3-5');
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 3-5/10');
    assert.equal(part.headers.get('content-type'), 'video/mp4');
    assert.equal(await part.text(), '345');

    const whole = fileResponse(file, null, { 'Access-Control-Allow-Origin': '*' });
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get('access-control-allow-origin'), '*');
    assert.equal(await whole.text(), '0123456789');

    assert.equal(fileResponse(file, 'bytes=50-').status, 416);
});
