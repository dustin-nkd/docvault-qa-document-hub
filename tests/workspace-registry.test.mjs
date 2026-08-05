import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStorage, toPlain } from './harness.mjs';

// The bug this covers: a workspace created on one device pushed its documents
// to workspaces/<id>/ in the vault repo but its existence never left that
// browser's localStorage, so every other device showed only "Personal" and the
// synced documents were unreachable. The registry is shared state now, and
// these tests pin the merge rules that make sharing it safe.

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const load = (localStorage = {}) => loadStorage({ localStorage }).api.WorkspaceRegistry;
const ids = (list) => toPlain(list).map(entry => entry.id);

test('a workspace created on another device is adopted', () => {
    const registry = load();
    const merged = registry.merge(
        { workspaces: [], deleted: [] },
        { workspaces: [{ id: 'trulioo', name: 'Trulioo', createdAt: NOW - DAY, updatedAt: NOW - DAY }], deleted: [] }
    );
    assert.deepEqual(ids(merged.workspaces), ['trulioo']);
    assert.equal(merged.workspaces[0].name, 'Trulioo');
});

test('a workspace created on this device survives a merge with an older repo', () => {
    const registry = load();
    const merged = registry.merge(
        { workspaces: [{ id: 'opentext', name: 'OpenText', createdAt: NOW - DAY, updatedAt: NOW - DAY }], deleted: [] },
        { workspaces: [{ id: 'trulioo', name: 'Trulioo', createdAt: NOW - 2 * DAY, updatedAt: NOW - 2 * DAY }], deleted: [] }
    );
    assert.deepEqual(ids(merged.workspaces), ['trulioo', 'opentext']);
});

test('the most recent rename wins, whichever side it came from', () => {
    const registry = load();
    const older = { id: 'trulioo', name: 'Trulioo', createdAt: NOW - 2 * DAY, updatedAt: NOW - 2 * DAY };
    const newer = { id: 'trulioo', name: 'Trulioo QA', createdAt: NOW - 2 * DAY, updatedAt: NOW - DAY };

    assert.equal(registry.merge({ workspaces: [older] }, { workspaces: [newer] }).workspaces[0].name, 'Trulioo QA');
    assert.equal(registry.merge({ workspaces: [newer] }, { workspaces: [older] }).workspaces[0].name, 'Trulioo QA');
});

test('an entry written before the registry synced is versioned by its creation time', () => {
    // Registries already on disk carry {id, name, createdAt} and no updatedAt.
    // Treating that as version 0 would let any remote entry silently rename it.
    const registry = load();
    const merged = registry.merge(
        { workspaces: [{ id: 'trulioo', name: 'Local name', createdAt: NOW - DAY }] },
        { workspaces: [{ id: 'trulioo', name: 'Older remote name', createdAt: NOW - 9 * DAY, updatedAt: NOW - 9 * DAY }] }
    );
    assert.equal(merged.workspaces[0].name, 'Local name');
    assert.equal(merged.workspaces[0].createdAt, NOW - 9 * DAY, 'the earliest known creation date is kept');
});

test('a deletion is not undone by a device that still lists the workspace', () => {
    const registry = load();
    const merged = registry.merge(
        { workspaces: [{ id: 'trulioo', name: 'Trulioo', createdAt: NOW - 9 * DAY, updatedAt: NOW - 9 * DAY }], deleted: [] },
        { workspaces: [], deleted: [{ id: 'trulioo', deletedAt: NOW - DAY }] }
    );
    assert.deepEqual(toPlain(merged.workspaces), []);
    assert.deepEqual(toPlain(merged.deleted), [{ id: 'trulioo', deletedAt: NOW - DAY }]);
});

test('a workspace re-created after a deletion is not swallowed by the tombstone', () => {
    const registry = load();
    const merged = registry.merge(
        { workspaces: [{ id: 'trulioo', name: 'Trulioo', createdAt: NOW, updatedAt: NOW }] },
        { workspaces: [], deleted: [{ id: 'trulioo', deletedAt: NOW - DAY }] }
    );
    assert.deepEqual(ids(merged.workspaces), ['trulioo']);
});

test('expired tombstones stop being carried around', () => {
    const registry = load();
    const merged = registry.merge(
        { deleted: [{ id: 'stale', deletedAt: NOW - 200 * DAY }, { id: 'recent', deletedAt: NOW - DAY }] },
        null
    );
    assert.deepEqual(ids(merged.deleted), ['recent']);
});

test('an id that could escape its namespace is never adopted', () => {
    // The id becomes part of a localStorage key AND a GitHub path, and the
    // remote registry is as untrusted as any other input.
    const registry = load();
    const hostile = ['../../etc', 'a/b', 'Trulioo', '-lead', '', 'x'.repeat(40), 'default'];
    const merged = registry.merge({ workspaces: [] }, {
        workspaces: [
            ...hostile.map(id => ({ id, name: id, createdAt: NOW, updatedAt: NOW })),
            { id: 'ok', name: 'Ok', createdAt: NOW, updatedAt: NOW }
        ],
        deleted: hostile.map(id => ({ id, deletedAt: NOW }))
    });
    assert.deepEqual(ids(merged.workspaces), ['ok']);
    assert.deepEqual(ids(merged.deleted), []);
});

test('merging is deterministic, so an unchanged registry is never republished', () => {
    const registry = load();
    const remote = {
        workspaces: [
            { id: 'opentext', name: 'OpenText', createdAt: NOW - DAY, updatedAt: NOW - DAY },
            { id: 'trulioo', name: 'Trulioo', createdAt: NOW - 2 * DAY, updatedAt: NOW - 2 * DAY }
        ],
        deleted: [{ id: 'gone', deletedAt: NOW - DAY }],
        defaultName: 'Personal',
        defaultNameAt: NOW - 3 * DAY
    };
    const normalised = JSON.stringify(registry.merge(remote, null));
    assert.equal(JSON.stringify(registry.merge(registry.merge(remote, null), remote)), normalised);
});

test('the default workspace label merges by recency', () => {
    const registry = load();
    assert.equal(registry.merge(
        { defaultName: 'Local', defaultNameAt: NOW - 2 * DAY },
        { defaultName: 'Remote', defaultNameAt: NOW - DAY }
    ).defaultName, 'Remote');
    assert.equal(registry.merge(
        { defaultName: 'Local', defaultNameAt: NOW - DAY },
        { defaultName: 'Remote', defaultNameAt: NOW - 2 * DAY }
    ).defaultName, 'Local');
});

test('adopting a registry reports what the app has to react to', () => {
    const harness = loadStorage({
        localStorage: {
            docvault_active_workspace: 'trulioo',
            docvault_workspaces: JSON.stringify([{ id: 'trulioo', name: 'Trulioo', createdAt: NOW - 9 * DAY, updatedAt: NOW - 9 * DAY }]),
            ws_opentext__docvault_docs: 'ENC:theirs',
            ws_opentext__docvault_history_abc: '[]',
            ws_trulioo__docvault_docs: 'ENC:mine'
        }
    });
    const registry = harness.api.WorkspaceRegistry;

    const merged = registry.merge(registry.readLocal(), {
        workspaces: [{ id: 'opentext', name: 'OpenText', createdAt: NOW - 8 * DAY, updatedAt: NOW - 8 * DAY }],
        deleted: [{ id: 'opentext', deletedAt: NOW - DAY }, { id: 'trulioo', deletedAt: NOW - DAY }]
    });
    const result = registry.writeLocal(merged);

    assert.equal(result.changed, true);
    assert.equal(result.activeWasDeleted, true, 'the user is sitting in a workspace deleted elsewhere');
    // Data for a workspace deleted elsewhere is dropped...
    assert.equal(harness.localStorage.getItem('ws_opentext__docvault_docs'), null);
    assert.equal(harness.localStorage.getItem('ws_opentext__docvault_history_abc'), null);
    // ...but never out from under the workspace the user is still in.
    assert.equal(harness.localStorage.getItem('ws_trulioo__docvault_docs'), 'ENC:mine');
    assert.deepEqual(JSON.parse(harness.localStorage.getItem('docvault_workspaces')), []);
});

test('a second write of the same registry reports no change', () => {
    const harness = loadStorage({ localStorage: {} });
    const registry = harness.api.WorkspaceRegistry;
    const payload = registry.merge({ workspaces: [{ id: 'trulioo', name: 'Trulioo', createdAt: NOW, updatedAt: NOW }] }, null);

    assert.equal(registry.writeLocal(payload).changed, true);
    assert.equal(registry.writeLocal(payload).changed, false);
});

test('recording a deletion leaves a tombstone the merge can read back', () => {
    const harness = loadStorage({ localStorage: {} });
    const registry = harness.api.WorkspaceRegistry;
    registry.recordDeletion('trulioo');
    registry.recordDeletion('default');
    registry.recordDeletion('../escape');

    const tombstones = toPlain(registry.readLocal().deleted);
    assert.deepEqual(tombstones.map(entry => entry.id), ['trulioo']);
    assert.ok(tombstones[0].deletedAt > 0);
});

test('the shared registry lives outside every workspace it describes', () => {
    // wsPath()/wsKey() would file it under whichever workspace happened to be
    // active, where no other workspace could ever find it.
    const registry = load();
    assert.equal(registry.PATH, 'database/workspaces.json');
    assert.equal(registry.SHA_KEY, 'docvault_workspaces_sha');

    const scoped = load({ docvault_active_workspace: 'trulioo' });
    assert.equal(scoped.PATH, 'database/workspaces.json');
    assert.equal(scoped.SHA_KEY, 'docvault_workspaces_sha');
});
