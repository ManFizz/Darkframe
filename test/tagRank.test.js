const test = require('node:test');
const assert = require('node:assert/strict');
const { rankTags, matchScore } = require('../src/js/shared/tagRank');

const names = (list) => list.map(t => t.name);
const tags = ['ashe_(overwatch)', 'freja_(overwatch)', 'juno_(overwatch)', 'kiriko_(overwatch)', 'overwatch', 'overwatch_2']
    .map((name, i) => ({ name, count: 100 - i }));

test('the whole name comes first, then names that start with it', () => {
    assert.deepEqual(names(rankTags(tags, 'overwatch')).slice(0, 2), ['overwatch', 'overwatch_2']);
    assert.deepEqual(names(rankTags(tags, 'overwa')).slice(0, 2), ['overwatch', 'overwatch_2']);
});

test('a word inside the name beats a match in the middle of a word', () => {
    const list = [{ name: 'catwoman' }, { name: 'bobcat' }, { name: 'black_cat' }];
    assert.deepEqual(names(rankTags(list, 'cat')), ['catwoman', 'black_cat', 'bobcat']);
});

test('ties go to pinned, then to the more used tag', () => {
    const list = [{ name: 'cat_ears', count: 5 }, { name: 'cat_tail', count: 50 }, { name: 'cat_girl', count: 1, pinned: true }];
    assert.deepEqual(names(rankTags(list, 'cat')), ['cat_girl', 'cat_tail', 'cat_ears']);
});

test('a small typo still finds the tag, below the real matches', () => {
    assert.equal(matchScore('overwatch', 'ovrewatch'), 4);
    assert.equal(matchScore('overwatch', 'overwach'), 4);
    assert.equal(matchScore('ashe_(overwatch)', 'ovewatch'), 5);
    assert.equal(matchScore('overwatch', 'xyz'), Infinity);
    assert.equal(matchScore('cat', 'cta'), Infinity);   // too short to guess
    assert.deepEqual(names(rankTags([{ name: 'overwatch' }, { name: 'xoverwach' }], 'overwach')), ['xoverwach', 'overwatch']);
});

test('spaces and underscores are the same; a leading minus is ignored', () => {
    assert.equal(matchScore('big_breasts', 'big breasts'), 0);
    assert.equal(matchScore('video', '-vid'), 1);
});

test('with keep, unmatched entries stay at the end in their order', () => {
    const list = [{ name: 'zzz' }, { name: 'ow' }, { name: 'yyy' }, { name: 'overwatch' }];
    assert.deepEqual(names(rankTags(list, 'overwatch', { keep: true })), ['overwatch', 'zzz', 'ow', 'yyy']);
    assert.deepEqual(names(rankTags(list, 'overwatch')), ['overwatch']);
});
