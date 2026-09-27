const sandbox = require('./helpers/sandbox');   // must come first: fakes electron, temp DB
const test = require('node:test');
const assert = require('node:assert/strict');

let saved;
test.before(async () => {
    await sandbox.initDb();
    saved = require(sandbox.serverPath('services', 'savedSearches'));
});
test.after(() => sandbox.cleanup());

test('normalize: tag order / case / dupes do not matter, modifiers do', () => {
    const a = saved.normalize({ tags: ['Cat', 'dog', 'cat'], minScore: '10', sort: 'score' });
    const b = saved.normalize({ tags: 'dog cat', minScore: 10, sort: 'score', rating: 'any' });
    assert.equal(a.key, b.key);
    assert.equal(a.tags, 'cat dog');
    assert.notEqual(a.key, saved.normalize({ tags: 'dog cat', minScore: 50, sort: 'score' }).key);
    assert.equal(saved.normalize({ sort: 'weird', rating: 'x' }).sort, 'new');
});

test('add is idempotent per source, separate per source', async () => {
    const r1 = await saved.add(2, { tags: ['landscape', '-text'] });
    const r2 = await saved.add(2, { tags: ['-text', 'landscape'] });
    assert.equal(r1.existed, false);
    assert.equal(r2.existed, true);
    assert.equal(r2.id, r1.id);
    await saved.add(4, { tags: ['landscape', '-text'] });
    const list = await saved.list();
    assert.equal(list.filter(s => s.tags === 'landscape -text').length, 2);
});

test('remove + restore (undo) brings the same search back', async () => {
    const { id } = await saved.add(2, { tags: ['sky'], minScore: 5 }, 'Небо');
    const row = (await saved.list()).find(s => s.id === id);
    await saved.remove(id);
    assert.equal((await saved.list()).some(s => s.id === id), false);
    await saved.restore(row);
    const back = (await saved.list()).find(s => s.key === row.key);
    assert.equal(back.title, 'Небо');
    assert.equal(back.minScore, 5);
});

test('update title / lastTotal, reorder within a source', async () => {
    const a = (await saved.add(2, { tags: ['a'] })).id;
    const b = (await saved.add(2, { tags: ['b'] })).id;
    await saved.update(a, { title: 'Первый', lastTotal: 123 });
    let list = await saved.list();
    assert.equal(list.find(s => s.id === a).title, 'Первый');
    assert.equal(list.find(s => s.id === a).lastTotal, 123);

    const ids = list.filter(s => s.source === 2).map(s => s.id);
    const reversed = [...ids].reverse();
    list = await saved.reorder(2, reversed);
    assert.deepEqual(list.filter(s => s.source === 2).map(s => s.id), reversed);
    assert.ok(reversed.indexOf(b) < reversed.indexOf(a));
});
