import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({ console, window: {}, setTimeout, clearTimeout });
const source = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8') +
    '\n;globalThis.__searchTest = { getSearchIndexEntry, matchesSearchQuery, scoreSearchDocument };';
vm.runInContext(source, context, { filename: 'js/utils.js' });
const api = context.__searchTest;

test('search index reuses normalized content until a searchable field changes', () => {
    const doc = { title: 'Checkout Flow', content: 'Payment succeeds', tags: ['critical'] };
    const first = api.getSearchIndexEntry(doc);
    const second = api.getSearchIndexEntry(doc);
    assert.strictEqual(second, first);

    doc.content = 'Payment declined';
    const contentChanged = api.getSearchIndexEntry(doc);
    assert.notStrictEqual(contentChanged, first);
    assert.equal(contentChanged.content, 'payment declined');

    doc.tags.push('Regression');
    const tagsChanged = api.getSearchIndexEntry(doc);
    assert.notStrictEqual(tagsChanged, contentChanged);
    assert.deepEqual(Array.from(tagsChanged.tags), ['critical', 'regression']);
});

test('shared search matching remains case-insensitive across title, tags, and content', () => {
    const doc = { title: 'Checkout Flow', content: 'Payment declined by gateway', tags: ['Critical'] };
    assert.equal(api.matchesSearchQuery(doc, 'CHECKOUT'), true);
    assert.equal(api.matchesSearchQuery(doc, 'critical'), true);
    assert.equal(api.matchesSearchQuery(doc, 'Gateway'), true);
    assert.equal(api.matchesSearchQuery(doc, 'missing'), false);
    assert.equal(api.matchesSearchQuery({ title: 'Untitled' }, 'untitled'), true);
});

test('global search scoring preserves exact, prefix, tag, and content weights', () => {
    const doc = { title: 'Checkout', content: 'Gateway decline', tags: ['payment'] };
    assert.equal(api.scoreSearchDocument(doc, ['checkout']), 5);
    assert.equal(api.scoreSearchDocument(doc, ['check']), 3);
    assert.equal(api.scoreSearchDocument(doc, ['out']), 2);
    assert.equal(api.scoreSearchDocument(doc, ['payment']), 1.5);
    assert.equal(api.scoreSearchDocument(doc, ['gateway']), 0.5);
    assert.equal(api.scoreSearchDocument(doc, ['checkout', 'payment', 'gateway']), 7);
});
