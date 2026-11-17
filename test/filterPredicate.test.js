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

const { matchRules, normalizeRules, rulesNeedHistory } = require('../src/js/shared/filterPredicate');

test('rules: all / any groups and nesting', () => {
    const it = item({ sourceUrl: 'https://www.pixiv.net/artworks/1', duration: 30 });
    const r = (x) => matchRules(it, normalizeRules(x), NOW);
    assert.ok(r({ op: 'all', items: [{ field: 'tag', cmp: 'has', value: 'sea' }, { field: 'rating', cmp: 'gte', value: 7 }] }));
    assert.equal(r({ op: 'all', items: [{ field: 'tag', cmp: 'has', value: 'sea' }, { field: 'rating', cmp: 'gte', value: 8 }] }), false);
    assert.ok(r({ op: 'any', items: [{ field: 'tag', cmp: 'has', value: 'moon' }, { field: 'rating', cmp: 'lte', value: 7 }] }));
    // sea AND (moon OR landscape)
    assert.ok(r({ op: 'all', items: [
        { field: 'tag', cmp: 'has', value: 'sea' },
        { op: 'any', items: [{ field: 'tag', cmp: 'has', value: 'moon' }, { field: 'orientation', cmp: 'is', value: 'landscape' }] },
    ] }));
    assert.equal(r({ op: 'all', items: [
        { field: 'tag', cmp: 'has', value: 'sea' },
        { op: 'any', items: [{ field: 'tag', cmp: 'has', value: 'moon' }, { field: 'type', cmp: 'is', value: 'video' }] },
    ] }), false);
});

test('rules: source domain, title, size, imported, unfinished conditions', () => {
    const it = item({ sourceUrl: 'https://www.pixiv.net/artworks/1' });
    const r = (c) => matchRules(it, normalizeRules({ op: 'all', items: [c] }), NOW);
    assert.ok(r({ field: 'source', cmp: 'is', value: 'pixiv.net' }));
    assert.ok(r({ field: 'source', cmp: 'is', value: 'www.pixiv.net' }));
    assert.equal(r({ field: 'source', cmp: 'is', value: 'x.com' }), false);
    assert.ok(r({ field: 'source', cmp: 'not', value: 'x.com' }));
    assert.ok(r({ field: 'source', cmp: 'present' }));
    assert.ok(r({ field: 'title', cmp: 'has', value: 'sunset' }));
    assert.ok(r({ field: 'size', cmp: 'gte', value: 1.5 }));   // 2 MB
    assert.ok(r({ field: 'imported', cmp: 'within', value: 3 }));
    assert.equal(r({ field: 'imported', cmp: 'older', value: 3 }), false);
    assert.ok(r({ field: 'rating', cmp: 'gte', value: '' }), 'empty value = no constraint yet');
});

test('rules: viewed conditions use the history context', () => {
    const it = item({ id: 'a' });
    const tree = (c) => normalizeRules({ op: 'all', items: [c] });
    const ctx = (t) => ({ lastViewed: new Map(t ? [['a', t]] : []) });
    assert.ok(rulesNeedHistory(tree({ field: 'viewed', cmp: 'never' })));
    assert.ok(matchRules(it, tree({ field: 'viewed', cmp: 'never' }), NOW, ctx(0)));
    assert.equal(matchRules(it, tree({ field: 'viewed', cmp: 'never' }), NOW, ctx(NOW - 10)), false);
    assert.ok(matchRules(it, tree({ field: 'viewed', cmp: 'not_within', value: 30 }), NOW, ctx(NOW - 40 * DAY)));
    assert.equal(matchRules(it, tree({ field: 'viewed', cmp: 'not_within', value: 30 }), NOW, ctx(NOW - DAY)), false);
    assert.ok(matchRules(it, tree({ field: 'viewed', cmp: 'never' }), NOW, null), 'no history → no filtering');
});

test('legacy flat filters still work next to rules', () => {
    const f = normalizeFilter({ tags: [{ name: 'sea' }], rules: { op: 'all', items: [{ field: 'rating', cmp: 'gte', value: 7 }] } });
    assert.ok(matchItem(item(), f, NOW));
    assert.equal(matchItem(item({ rating: 3 }), f, NOW), false);
    assert.equal(normalizeFilter({}).rules, null);
    assert.equal(normalizeRules({ op: 'all', items: [{ field: 'bogus' }] }).items.length, 0);
});
