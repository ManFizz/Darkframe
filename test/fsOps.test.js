const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ops = require('../server/services/fsOps');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darkframe-fsops-'));
const file = (name, body = 'x') => { const p = path.join(root, name); fs.writeFileSync(p, body); return p; };
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('names: forbidden characters, reserved words and trailing dots are refused', () => {
    for (const bad of ['', '  ', 'a/b', 'a\\b', 'a:b', 'what?', 'con', 'NUL.txt', 'dot.', '..']) {
        assert.throws(() => ops.checkName(bad), undefined, bad);
    }
    assert.equal(ops.checkName('  ok name.jpg '), 'ok name.jpg');
});

test('rename keeps the folder, refuses to overwrite, allows a case-only change', () => {
    const a = file('a.jpg');
    file('taken.jpg');
    assert.throws(() => ops.rename(a, 'taken.jpg'), /уже существует/);
    const { path: b } = ops.rename(a, 'b.jpg');
    assert.equal(b, path.join(root, 'b.jpg'));
    assert.ok(fs.existsSync(b) && !fs.existsSync(a));
    const { path: B } = ops.rename(b, 'B.jpg');
    assert.equal(path.basename(fs.readdirSync(root).find(n => n.toLowerCase() === 'b.jpg')), 'B.jpg');
    assert.equal(B, path.join(root, 'B.jpg'));
});

test('mkdir creates once', () => {
    const { path: p } = ops.mkdir(root, 'New');
    assert.ok(fs.statSync(p).isDirectory());
    assert.throws(() => ops.mkdir(root, 'New'), /уже существует/);
});

test('move: files go in, clashes and folders are skipped, nothing is overwritten', () => {
    const dest = ops.mkdir(root, 'dest').path;
    const m1 = file('m1.png', 'one');
    const m2 = file('m2.png', 'two');
    fs.writeFileSync(path.join(dest, 'm2.png'), 'already there');
    const res = ops.move([m1, m2, path.join(root, 'New')], dest);
    assert.deepEqual(res.moved, [path.join(dest, 'm1.png')]);
    assert.deepEqual(res.skipped.map(s => s.reason).sort(), ['exists', 'folder']);
    assert.equal(fs.readFileSync(path.join(dest, 'm2.png'), 'utf8'), 'already there');
    assert.ok(fs.existsSync(m2), 'clashing source stays');
});

test('trash goes through the given recycle-bin function only', async () => {
    const t = file('t.gif');
    const seen = [];
    const res = await ops.trash([t, path.join(root, 'missing.gif')], async (p) => {
        if (!fs.existsSync(p)) throw new Error('nope');
        seen.push(p);
    });
    assert.deepEqual(seen, [path.resolve(t)]);
    assert.equal(res.done.length, 1);
    assert.equal(res.failed.length, 1);
});
