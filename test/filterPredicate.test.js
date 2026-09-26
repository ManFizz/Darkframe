const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeFilter, matchItem, advancedCount, isFilterActive, toSmartFilter, mediaKind, orientationOf,
} = require('../src/js/shared/filterPredicate');

const NOW = 1_800_000_000;
const DAY = 86400;

const item = (over = {}) => ({
    id: 'x', title: 'Sunset beach', fileName: 'IMG_001.jpg', tags: ['sea', 'sun'],
    rating: 7, mimeType: 'image/jpeg', size: 2_000_000, width: 1920, height: 1080,
    importedAt: NOW - 2 * DAY, collectionId: 'c1', ...over,
});
const match = (f, it = item()) => matchItem(it, normalizeFilter(f), NOW);

test('empty filter matches everything and is inactive', () => {
    const f = normalizeFilter({});
    assert.equal(isFilterActive(f), false);
    assert.equal(advancedCount(f), 0);
    assert.ok(matchItem(item(), f, NOW));
});

test('normalizeFilter coerces legacy / junk values', () => {
    const f = normalizeFilter({
        ratingMin: '3', ratingMax: 99, types: ['video', 'nope'], orientation: 'diagonal',
        tags: [{ name: 'SEA' }, null, { exclude: true }], sizeMin: '', minSide: 'abc',
    });
    assert.equal(f.ratingMin, 3);
    assert.equal(f.ratingMax, 10);
    assert.deepEqual(f.types, ['video']);
    assert.equal(f.orientation, 'any');
    assert.deepEqual(f.tags, [{ name: 'sea', exclude: false }]);
    assert.equal(f.sizeMin, null);
    assert.equal(f.minSide, null);
});

test('search looks at title and file name, case-insensitive', () => {
    assert.ok(match({ search: 'SUNSET' }));
    assert.ok(match({ search: 'img_001' }));
    assert.equal(match({ search: 'mountain' }), false);
});

test('tags: include requires all, exclude rejects any', () => {
    assert.ok(match({ tags: [{ name: 'sea' }, { name: 'sun' }] }));
    assert.equal(match({ tags: [{ name: 'sea' }, { name: 'moon' }] }), false);
    assert.equal(match({ tags: [{ name: 'sun', exclude: true }] }), false);
    assert.ok(match({ tags: [{ name: 'moon', exclude: true }] }));
});

test('rating range, including "unrated only"', () => {
    assert.ok(match({ ratingMin: 7, ratingMax: 7 }));
    assert.equal(match({ ratingMin: 8 }), false);
    assert.ok(match({ ratingMin: 0, ratingMax: 0 }, item({ rating: 0 })));
    assert.equal(match({ ratingMin: 0, ratingMax: 0 }), false);
});

test('media kind and type filter', () => {
    assert.equal(mediaKind({ mimeType: 'video/mp4' }), 'video');
    assert.equal(mediaKind({ mimeType: 'image/gif' }), 'gif');
    assert.equal(mediaKind({ type: 2 }), 'video');
    assert.ok(match({ types: ['image'] }));
    assert.equal(match({ types: ['video', 'gif'] }), false);
});

test('size, shorter side and orientation', () => {
    assert.ok(match({ sizeMin: 1_000_000, sizeMax: 3_000_000 }));
    assert.equal(match({ sizeMax: 1_000_000 }), false);
    assert.ok(match({ minSide: 1080 }));
    assert.equal(match({ minSide: 1081 }), false);
    assert.equal(orientationOf(1000, 1030), 'square');
    assert.equal(orientationOf(0, 100), null);
    assert.ok(match({ orientation: 'landscape' }));
    assert.equal(match({ orientation: 'portrait' }), false);
    assert.equal(match({ minSide: 10 }, item({ width: 0, height: 0 })), false);
});

test('import date: relative window and absolute range', () => {
    assert.ok(match({ importedWithinDays: 3 }));
    assert.equal(match({ importedWithinDays: 1 }), false);
    assert.ok(match({ importedFrom: NOW - 3 * DAY, importedTo: NOW }));
    assert.equal(match({ importedFrom: NOW - DAY }), false);
});

test('noTags / noCollection', () => {
    assert.equal(match({ noTags: true }), false);
    assert.ok(match({ noTags: true }, item({ tags: [] })));
    assert.equal(match({ noCollection: true }), false);
    assert.ok(match({ noCollection: true }, item({ collectionId: null })));
});

test('collection tiles: only search/tag/rating apply, hidden by advanced conditions', () => {
    const tile = { isCollection: true, title: 'Beach trips', tags: [] };
    assert.ok(match({ search: 'beach' }, tile));
    assert.equal(match({ types: ['image'] }, tile), false);
});

test('advancedCount / toSmartFilter keep only filter fields', () => {
    const f = normalizeFilter({
        types: ['image'], sizeMin: 1, minSide: 5, orientation: 'square',
        noTags: true, noCollection: true, importedWithinDays: 2,
    });
    assert.equal(advancedCount(f), 7);
    const smart = toSmartFilter({ ...f, sortBy: 'rating', order: -1 });
    assert.equal('sortBy' in smart, false);
    assert.deepEqual(smart.types, ['image']);
});
