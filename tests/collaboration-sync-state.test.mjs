// CF-P7-009 — the five-state sync model.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    SYNC_STATES, TERMINAL_SYNC_STATES, RECOVERY_SITUATIONS, SyncStateError,
    deriveSyncState, presentSyncState, recoverySituations, isTerminal, renderSyncState
} from '../js/collaboration/sync-state.js';
import { OUTBOX_STATES } from '../js/collaboration/outbox.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function element(tagName) {
    const node = {
        tagName, children: [], attributes: new Map(), className: '', textContent: '',
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        appendChild(child) { this.children.push(child); return child; },
        querySelector(selector) { return descendants(this).find(matches(selector)) ?? null; },
        querySelectorAll(selector) { return descendants(this).filter(matches(selector)); }
    };
    return node;
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const matches = selector => node => {
    if (selector.startsWith('.')) return node.className.split(' ').includes(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) {
        const value = node.getAttribute(attribute[1]);
        return attribute[2] === undefined ? value !== null : value === attribute[2];
    }
    return node.tagName === selector;
};
const doc = { createElement: element };
const removed = { checked: true, activeMember: false };

// ── exactly five ─────────────────────────────────────────────────────────────

test('carries exactly the five frozen states and no sixth', () => {
    assert.deepEqual([...SYNC_STATES],
        ['saved', 'saving', 'offline', 'conflict', 'access-removed']);
});

test('only access removed is terminal', () => {
    assert.deepEqual([...TERMINAL_SYNC_STATES], ['access-removed']);
    assert.equal(isTerminal('access-removed'), true);
    for (const state of ['saved', 'saving', 'offline', 'conflict']) {
        assert.equal(isTerminal(state), false, state);
    }
});

test('every state carries a label and a distinct shape', () => {
    const shapes = new Set();
    for (const state of SYNC_STATES) {
        const presented = presentSyncState(state);
        assert.ok(presented.label.length > 2, state);
        assert.ok(presented.detail.length > 20, `${state} does not explain itself`);
        shapes.add(presented.shape);
    }
    assert.equal(shapes.size, SYNC_STATES.length, 'two states share a shape');
});

test('refuses a state outside the closed set', () => {
    assert.throws(() => presentSyncState('syncing'),
        error => error instanceof SyncStateError && error.code === 'UNKNOWN_SYNC_STATE');
});

// ── the derivation ───────────────────────────────────────────────────────────

test('an empty queue is Saved', () => {
    assert.equal(deriveSyncState({ entries: [] }).state, 'saved');
});

test('a queue whose work is applied is Saved', () => {
    assert.equal(deriveSyncState({ entries: [{ state: 'applied' }] }).state, 'saved');
});

test('a queued or inflight entry is Saving', () => {
    assert.equal(deriveSyncState({ entries: [{ state: 'queued' }] }).state, 'saving');
    assert.equal(deriveSyncState({ entries: [{ state: 'inflight' }] }).state, 'saving');
});

test('an unavailable transport is Offline even with nothing queued', () => {
    assert.equal(deriveSyncState({ entries: [], transportAvailable: false }).state, 'offline');
});

test('a browser reporting offline is Offline only while work is queued', () => {
    assert.equal(deriveSyncState({ entries: [{ state: 'queued' }], online: false }).state,
        'offline');
    assert.equal(deriveSyncState({ entries: [], online: false }).state, 'saved');
});

test('a revision conflict outranks the queue', () => {
    const state = deriveSyncState({
        entries: [{ state: 'queued' }], lastErrorCode: 'DOCUMENT_REVISION_CONFLICT'
    });
    assert.equal(state.state, 'conflict');
});

test('conflict is announced assertively and is never busy', () => {
    const state = presentSyncState('conflict');
    assert.equal(state.live, 'assertive');
    assert.equal(state.busy, false);
});

test('conflict says a draft is kept and nothing is merged automatically', () => {
    assert.match(presentSyncState('conflict').detail, /nothing is merged automatically/);
    assert.match(presentSyncState('conflict').detail, /draft is kept/);
});

// ── the rule that protects a non-disclosing API ──────────────────────────────

test('a denial alone is never Access removed', () => {
    for (const lastErrorCode of ['RESOURCE_NOT_FOUND', 'OPERATION_NOT_PERMITTED']) {
        const state = deriveSyncState({ entries: [], lastErrorCode });
        assert.notEqual(state.state, 'access-removed', lastErrorCode);
    }
});

test('an unfinished membership re-check is never Access removed', () => {
    const state = deriveSyncState({
        entries: [], lastErrorCode: 'RESOURCE_NOT_FOUND',
        membershipRecheck: { checked: false, activeMember: false }
    });
    assert.notEqual(state.state, 'access-removed');
});

test('a re-check that confirms membership is never Access removed', () => {
    const state = deriveSyncState({
        entries: [], lastErrorCode: 'RESOURCE_NOT_FOUND',
        membershipRecheck: { checked: true, activeMember: true }
    });
    assert.notEqual(state.state, 'access-removed');
});

test('a denial plus a completed re-check saying removed is Access removed', () => {
    const state = deriveSyncState({
        entries: [], lastErrorCode: 'RESOURCE_NOT_FOUND', membershipRecheck: removed
    });
    assert.equal(state.state, 'access-removed');
});

test('access removed outranks a busy queue and a conflict', () => {
    const state = deriveSyncState({
        entries: [{ state: 'inflight' }], lastErrorCode: 'RESOURCE_NOT_FOUND',
        membershipRecheck: removed
    });
    assert.equal(state.state, 'access-removed');
});

test('access removed points at re-entry rather than a retry', () => {
    assert.match(presentSyncState('access-removed').detail, /workspace switcher/);
    assert.match(presentSyncState('access-removed').detail, /retrying here will not help/);
    assert.equal(presentSyncState('access-removed').terminal, true);
});

// ── the outbox is a different axis ───────────────────────────────────────────

test('the outbox has six states and this model has five', () => {
    assert.equal(OUTBOX_STATES.length, 6);
    assert.equal(SYNC_STATES.length, 5);
});

test('expired and quarantined are not sync states', () => {
    for (const situation of RECOVERY_SITUATIONS) {
        assert.equal(SYNC_STATES.includes(situation), false, situation);
    }
});

test('a quarantined queue does not become an error state', () => {
    const state = deriveSyncState({ entries: [{ state: 'quarantined' }] });
    assert.equal(state.state, 'saved', 'a quarantined entry was treated as pending work');
    assert.equal(SYNC_STATES.includes('error'), false);
});

test('recovery situations are reported separately, and say the work is kept', () => {
    const found = recoverySituations([
        { state: 'applied' }, { state: 'expired' }, { state: 'quarantined' }
    ]);
    assert.equal(found.length, 2);
    for (const situation of found) {
        assert.match(situation.detail, /kept, not discarded/);
    }
});

test('rejects an outbox state the queue cannot produce', () => {
    assert.throws(() => deriveSyncState({ entries: [{ state: 'sending' }] }),
        error => error.code === 'UNKNOWN_OUTBOX_STATE');
});

// ── the rendered indicator ───────────────────────────────────────────────────

test('exposes the state as data and announces it politely', () => {
    const node = renderSyncState(doc, deriveSyncState({ entries: [{ state: 'queued' }] }));
    assert.equal(node.getAttribute('data-sync-state'), 'saving');
    assert.equal(node.getAttribute('aria-live'), 'polite');
    assert.equal(node.getAttribute('aria-busy'), 'true');
});

test('marks a terminal state as terminal in the DOM', () => {
    const node = renderSyncState(doc, presentSyncState('access-removed'));
    assert.equal(node.getAttribute('data-terminal'), 'true');
    assert.equal(node.getAttribute('aria-live'), 'assertive');
});

test('renders a shape alongside the label for every state', () => {
    for (const state of SYNC_STATES) {
        const node = renderSyncState(doc, presentSyncState(state));
        assert.notEqual(node.querySelector('.collab-sync__shape'), null, state);
        assert.ok(node.querySelector('.collab-sync__label').textContent.length > 2, state);
    }
});

test('renders recovery situations without changing the sync state', () => {
    const model = deriveSyncState({ entries: [{ state: 'quarantined' }] });
    const node = renderSyncState(doc, model, recoverySituations([{ state: 'quarantined' }]));
    assert.equal(node.getAttribute('data-sync-state'), 'saved');
    assert.equal(node.querySelector('[data-recovery]').getAttribute('data-recovery'),
        'quarantined');
});

test('builds every node through the document, never through innerHTML', () => {
    assert.equal(/\.innerHTML/.test(read('js/collaboration/sync-state.js')), false);
});
