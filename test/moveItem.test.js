const test = require('node:test');
const assert = require('node:assert/strict');
const { moveItem } = require('../src/js/shared/moveItem');

const list = ['a', 'b', 'c', 'd'].map(uniqueId => ({ uniqueId }));
const ids = (items) => items.map(f => f.uniqueId).join('');

test('moves left and right, on either side of the target', () => {
    assert.equal(ids(moveItem(list, 'd', 'b')), 'adbc');
    assert.equal(ids(moveItem(list, 'd', 'b', true)), 'abdc');
    assert.equal(ids(moveItem(list, 'a', 'c')), 'bacd');
    assert.equal(ids(moveItem(list, 'a', 'c', true)), 'bcad');
});

test('the neighbour on the right can be passed', () => {
    assert.equal(ids(moveItem(list, 'a', 'b', true)), 'bacd');
});

test('the end of the list can be reached', () => {
    assert.equal(ids(moveItem(list, 'a', 'd', true)), 'bcda');
});

test('a drop that changes nothing returns the same array', () => {
    assert.equal(moveItem(list, 'a', 'a'), list);
    assert.equal(moveItem(list, 'a', 'b'), list);
    assert.equal(moveItem(list, 'b', 'a', true), list);
    assert.equal(moveItem(list, 'x', 'a'), list);
    assert.equal(moveItem(list, 'a', 'x'), list);
});

test('the source array is not changed', () => {
    moveItem(list, 'd', 'a');
    assert.equal(ids(list), 'abcd');
});
