const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const logger = require('../server/logger');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkframe-log-'));
const read = () => fs.readFileSync(path.join(dir, 'darkframe.log'), 'utf8');
const flush = () => new Promise(r => setTimeout(r, 50));

test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* locked */ } });

test('lines carry time, level and the error stack', async () => {
    logger._open(dir);
    logger.write('ERROR', ['failed:', new Error('boom')]);
    logger.fromRenderer({ source: 'Библиотека', message: 'render failed', componentStack: '\n    at LibraryView' });
    await flush();
    const text = read();
    assert.match(text, /^\d{4}-\d\d-\d\dT[\d:.]+Z ERROR failed: Error: boom\n\s+at /m);
    assert.match(text, /VIEW  \[Библиотека\]\nrender failed\n\n {4}at LibraryView/);
});

test('a report from the window is capped', async () => {
    logger.fromRenderer({ message: 'x'.repeat(50000) });
    await flush();
    const line = read().split('\n').find(l => l.includes('xxxx'));
    assert.ok(line.length < 10100, `length ${line.length}`);
});

test('past the size limit the log moves to .1 and starts over', async () => {
    const chunk = 'y'.repeat(64 * 1024);
    for (let i = 0; i < Math.ceil(logger.MAX_BYTES / chunk.length) + 1; i++) logger.write('INFO', [chunk]);
    await flush();
    assert.ok(fs.existsSync(path.join(dir, 'darkframe.log.1')));
    assert.ok(fs.statSync(path.join(dir, 'darkframe.log')).size < logger.MAX_BYTES);
});
