const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { phashOf, groupSimilar, popcount32 } = require('../server/services/phash');

const dist = (a, b) =>
    popcount32(parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) +
    popcount32(parseInt(a.slice(8), 16) ^ parseInt(b.slice(8), 16));

// Deterministic "photo": a gradient plus a few shapes (noise would hash randomly).
function scene(variant) {
    const shapes = variant === 'a'
        ? '<circle cx="200" cy="150" r="90" fill="#f5c542"/><rect x="420" y="260" width="260" height="180" fill="#2a6fdb"/>'
        : '<rect x="60" y="60" width="200" height="380" fill="#d33"/><circle cx="560" cy="120" r="70" fill="#1b1"/>';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">'
        + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        + '<stop offset="0" stop-color="#123"/><stop offset="1" stop-color="#9bd"/></linearGradient></defs>'
        + '<rect width="800" height="500" fill="url(#g)"/>' + shapes + '</svg>';
    return sharp(Buffer.from(svg)).png().toBuffer();
}

test('popcount32', () => {
    assert.equal(popcount32(0), 0);
    assert.equal(popcount32(0xffffffff), 32);
    assert.equal(popcount32(0b1011), 3);
});

test('re-encoded / resized copies hash (almost) the same, a different image does not', async () => {
    const a = await scene('a');
    const base = await phashOf(a);
    assert.match(base, /^[0-9a-f]{16}$/);

    const jpeg  = await phashOf(await sharp(a).jpeg({ quality: 40 }).toBuffer());
    const small = await phashOf(await sharp(a).resize(320).webp().toBuffer());
    const other = await phashOf(await scene('b'));

    assert.ok(dist(base, jpeg) <= 4, `jpeg distance ${dist(base, jpeg)}`);
    assert.ok(dist(base, small) <= 4, `resized distance ${dist(base, small)}`);
    assert.ok(dist(base, other) > 12, `different image distance ${dist(base, other)}`);
});

test('groupSimilar links near pairs transitively and drops loners', async () => {
    const groups = await groupSimilar([
        { id: 'a', phash: '0000000000000000' },
        { id: 'b', phash: '0000000000000003' },   // 2 from a
        { id: 'c', phash: '000000000000000f' },   // 2 from b, 4 from a
        { id: 'z', phash: 'ffffffffffffffff' },
    ], 2);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].map(g => g.id).sort(), ['a', 'b', 'c']);
    assert.ok(groups[0].every(g => g.distance <= 2));
});
