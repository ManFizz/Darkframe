const test = require('node:test');
const assert = require('node:assert/strict');
const { SORTS, comparator, dirLabel, sortOf } = require('../src/js/shared/librarySort');

const item = (id, over = {}) => ({ id, title: id, importedAt: 100, rating: 0, size: 0, width: 0, height: 0, tags: [], mimeType: 'image/jpeg', ...over });
const ids = (list) => list.map(x => x.id);

test('every sort has a label and an icon; directions are said in words', () => {
    for (const s of SORTS) {
        assert.ok(s.label && s.icon, s.id);
        if (!s.random) assert.equal(s.dir.length, 2, s.id);
    }
    assert.equal(dirLabel('importedAt', -1), 'сначала новые');
    assert.equal(sortOf('nope').id, 'order');
});

test('titles sort naturally (2 before 10), ties keep a stable order', () => {
    const list = [item('Глава 10'), item('глава 2'), item('Глава 1')];
    assert.deepEqual(ids([...list].sort(comparator('title', 1))), ['Глава 1', 'глава 2', 'Глава 10']);
    // equal ratings → newest first, then by id
    const r = [item('b', { rating: 5, importedAt: 1 }), item('a', { rating: 5, importedAt: 1 }), item('c', { rating: 5, importedAt: 9 })];
    assert.deepEqual(ids([...r].sort(comparator('rating', -1))), ['c', 'a', 'b']);
});

test('views, proportions, resolution, type', () => {
    const list = [
        item('never'),
        item('often', { viewCount: 9, lastViewedAt: 50 }),
        item('once', { viewCount: 1, lastViewedAt: 500 }),
    ];
    assert.deepEqual(ids([...list].sort(comparator('viewCount', -1))), ['often', 'once', 'never']);
    // "long not opened": never opened ones first
    assert.deepEqual(ids([...list].sort(comparator('lastViewedAt', 1))), ['never', 'often', 'once']);

    const shapes = [item('wide', { width: 1920, height: 1080 }), item('tall', { width: 900, height: 1600 }), item('square', { width: 500, height: 500 })];
    assert.deepEqual(ids([...shapes].sort(comparator('aspect', 1))), ['tall', 'square', 'wide']);
    assert.deepEqual(ids([...shapes].sort(comparator('pixels', -1))), ['wide', 'tall', 'square']);

    const kinds = [item('v', { mimeType: 'video/mp4' }), item('m', { mimeType: 'application/x-darkframe-manga', isManga: true }), item('g', { mimeType: 'image/gif' }), item('p')];
    assert.deepEqual(ids([...kinds].sort(comparator('type', 1))), ['p', 'g', 'v', 'm']);
});

test('random: the same seed gives the same shuffle, another seed another one', () => {
    const list = Array.from({ length: 40 }, (_, i) => item(`id${i}`));
    const a = ids([...list].sort(comparator('random', 1, 12345)));
    const b = ids([...list].reverse().sort(comparator('random', 1, 12345)));
    const c = ids([...list].sort(comparator('random', 1, 999)));
    assert.deepEqual(a, b, 'independent of the input order');
    assert.notDeepEqual(a, c);
    assert.notDeepEqual(a, ids(list), 'actually shuffled');
});
