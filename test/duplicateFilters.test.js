const test = require('node:test');
const assert = require('node:assert/strict');
const { filterGroups, collectionOptions, summarize, planMarks, fullyMarked } = require('../src/js/shared/duplicateFilters');

const MB = 1024 * 1024;
const item = (id, collectionId, extra = {}) => ({
    id, collectionId, collectionName: collectionId == null ? 'Без коллекции' : `c${collectionId}`,
    mimeType: 'image/jpeg', size: MB, width: 100, height: 100, ...extra,
});
const sameFolder = { hash: 'same', items: [item('a1', 1), item('a2', 1)] };
const twoFolders = { hash: 'two', items: [item('b1', 1), item('b2', 2)] };
const looseCopy = { hash: 'loose', items: [item('c1', 2), item('c2', null)] };
const bothLoose = { hash: 'nowhere', items: [item('d1', null), item('d2', null)] };
const all = [sameFolder, twoFolders, looseCopy, bothLoose];
const hashes = (groups) => groups.map(g => g.hash);

test('no filters: every group stays', () => {
    assert.deepEqual(hashes(filterGroups(all, {})), ['same', 'two', 'loose', 'nowhere']);
});

test('different collections: copies in one place drop, "no collection" counts as a place', () => {
    assert.deepEqual(hashes(filterGroups(all, { acrossCollections: true })), ['two', 'loose']);
});

test('a group that spans collections is kept whole, with its copies in the same one', () => {
    const mixed = { hash: 'mixed', items: [item('e1', 1), item('e2', 1), item('e3', 2)] };
    const [kept] = filterGroups([mixed], { acrossCollections: true });
    assert.equal(kept.items.length, 3);
});

test('one collection, alone and combined with different collections', () => {
    assert.deepEqual(hashes(filterGroups(all, { collection: '1' })), ['same', 'two']);
    assert.deepEqual(hashes(filterGroups(all, { collection: '1', acrossCollections: true })), ['two']);
    assert.deepEqual(hashes(filterGroups(all, { collection: 'none' })), ['loose', 'nowhere']);
});

test('type, size and resolution', () => {
    const video = { hash: 'video', items: [item('v1', 1, { mimeType: 'video/mp4', size: 50 * MB }), item('v2', 1, { mimeType: 'video/mp4', size: 50 * MB })] };
    const gif = { hash: 'gif', items: [item('g1', 1, { mimeType: 'image/gif' }), item('g2', 1, { mimeType: 'image/gif' })] };
    const resized = { hash: 'resized', items: [item('r1', 1, { width: 2000, height: 1000 }), item('r2', 1)] };
    const groups = [video, gif, resized];
    assert.deepEqual(hashes(filterGroups(groups, { type: 'video' })), ['video']);
    assert.deepEqual(hashes(filterGroups(groups, { type: 'gif' })), ['gif']);
    assert.deepEqual(hashes(filterGroups(groups, { type: 'image' })), ['resized']);
    assert.deepEqual(hashes(filterGroups(groups, { minSize: 10 * MB })), ['video']);
    assert.deepEqual(hashes(filterGroups(groups, { differentResolution: true })), ['resized']);
});

test('the picker lists each collection once, with the number of its groups', () => {
    assert.deepEqual(collectionOptions(all).map(o => [o.id, o.groups]).sort(), [['1', 2], ['2', 2], ['none', 2]]);
});

test('totals count what would be freed by keeping the first copy', () => {
    const groups = [{ hash: 'x', items: [item('x1', 1, { size: 5 }), item('x2', 2, { size: 3 }), item('x3', 2, { size: 2 })] }];
    assert.deepEqual(summarize(groups), { totalGroups: 1, totalItems: 3, reclaimable: 5 });
});

test('bulk marks: all but the first copy, unmarking the first', () => {
    assert.deepEqual(planMarks([sameFolder, twoFolders]), { mark: ['a2', 'b2'], unmark: ['a1', 'b1'] });
});

test('bulk marks by collection: its copies go, a group entirely inside keeps one', () => {
    assert.deepEqual(planMarks([sameFolder, twoFolders], '1'), { mark: ['a2', 'b1'], unmark: ['a1', 'b2'] });
    assert.deepEqual(planMarks([looseCopy], 'none'), { mark: ['c2'], unmark: ['c1'] });
});

test('a group with every copy marked is reported', () => {
    assert.equal(fullyMarked([sameFolder, twoFolders], new Set(['a1', 'a2', 'b1'])), 1);
});
