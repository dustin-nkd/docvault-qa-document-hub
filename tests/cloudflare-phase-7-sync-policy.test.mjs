// Drift tests for the CF-P7-009 gate. Each case mutates one thing and asserts
// the policy rejects it, so the gate is known to bite.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7Sync, code } from '../scripts/cloudflare-phase-7-sync-policy.mjs';
import { SYNC_STATES, deriveSyncState, presentSyncState, recoverySituations }
    from '../js/collaboration/sync-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const input = () => ({
    manifest: json('config/cloudflare/phase-7-sync-state.json'),
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    journeySource: read('js/collaboration/sync-state.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    unitTestSource: read('tests/collaboration-sync-state.test.mjs'),
    journeyExports: {
        SYNC_STATES: [...SYNC_STATES], deriveSyncState, presentSyncState, recoverySituations
    }
});

test('the policy accepts the repository as it stands', () => {
    assert.equal(validatePhase7Sync(input()), true);
});

// ── exactly five ─────────────────────────────────────────────────────────────

test('a sixth state is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.machine.states = [...SYNC_STATES, 'error'];
    drifted.manifest.machine.count = 6;
    assert.throws(() => validatePhase7Sync(drifted), /sync state set drifted/);
});

test('a module exposing a different state set is rejected', () => {
    const drifted = input();
    drifted.journeyExports.SYNC_STATES = [...SYNC_STATES, 'error'];
    assert.throws(() => validatePhase7Sync(drifted), /state set other than the frozen one/);
});

test('two states sharing a shape is rejected', () => {
    const drifted = input();
    drifted.journeyExports.presentSyncState = state =>
        ({ ...presentSyncState(state), shape: 'dot' });
    assert.throws(() => validatePhase7Sync(drifted), /share a shape/);
});

test('claiming colour alone may signal state is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.machine.state_by_colour_alone = true;
    assert.throws(() => validatePhase7Sync(drifted), /colour alone/);
});

test('claiming conflict may be left automatically is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.machine.conflict_left_automatically = true;
    assert.throws(() => validatePhase7Sync(drifted), /without an explicit resolution/);
});

test('a contract that no longer lists the same five is rejected', () => {
    const drifted = input();
    drifted.contract = clone(drifted.contract);
    drifted.contract.sync_state_machine.states = ['Saved', 'Saving', 'Offline', 'Conflict'];
    assert.throws(() => validatePhase7Sync(drifted), /no longer lists exactly these five/);
});

// ── the non-disclosure rule ──────────────────────────────────────────────────

test('claiming access removal from a bare status code is rejected', () => {
    const drifted = input();
    drifted.journeyExports.deriveSyncState = args =>
        args.lastErrorCode === 'RESOURCE_NOT_FOUND'
            ? presentSyncState('access-removed')
            : deriveSyncState(args);
    assert.throws(() => validatePhase7Sync(drifted), /now claims access removal/);
});

test('claiming access removal on an unfinished re-check is rejected', () => {
    const drifted = input();
    drifted.journeyExports.deriveSyncState = args =>
        args.membershipRecheck && args.membershipRecheck.activeMember === false
            ? presentSyncState('access-removed')
            : deriveSyncState(args);
    assert.throws(() => validatePhase7Sync(drifted), /unfinished membership re-check/);
});

test('losing the terminal state entirely is rejected', () => {
    const drifted = input();
    drifted.journeyExports.deriveSyncState = () => presentSyncState('saved');
    assert.throws(() => validatePhase7Sync(drifted), /no longer reaches the terminal state/);
});

test('dropping the re-check condition from the source is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace(/membershipRecheck\.checked === true/g, 'true');
    assert.throws(() => validatePhase7Sync(drifted), /no longer required/);
});

test('claiming the state is derivable from a status code is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.access_removed.claimable_from_status_code_alone = true;
    assert.throws(() => validatePhase7Sync(drifted), /leaks resource existence/);
});

test('letting a busy queue outrank the terminal state is rejected', () => {
    const drifted = input();
    drifted.journeyExports.deriveSyncState = args =>
        args.entries.length > 0 ? presentSyncState('saving') : deriveSyncState(args);
    assert.throws(() => validatePhase7Sync(drifted), /outranks a terminal state|no longer reaches/);
});

// ── the outbox axis ──────────────────────────────────────────────────────────

test('flattening a recovery situation into an error is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.outbox_axis.recovery_flattened_into_error = true;
    assert.throws(() => validatePhase7Sync(drifted), /flattened into an error/);
});

test('treating a quarantined entry as pending work is rejected', () => {
    const drifted = input();
    drifted.journeyExports.deriveSyncState = args =>
        args.entries.some(entry => entry.state === 'quarantined')
            ? presentSyncState('saving')
            : deriveSyncState(args);
    assert.throws(() => validatePhase7Sync(drifted), /treated as pending work/);
});

test('no longer reporting recovery situations is rejected', () => {
    const drifted = input();
    drifted.journeyExports.recoverySituations = () => [];
    assert.throws(() => validatePhase7Sync(drifted), /no longer reported separately/);
});

test('redefining the outbox vocabulary here is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace("from './outbox.js'", "from './elsewhere.js'");
    assert.throws(() => validatePhase7Sync(drifted), /no longer reused from CF-P6-006/);
});

test('changing the outbox state count is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.outbox_axis.outbox_state_count = 5;
    assert.throws(() => validatePhase7Sync(drifted), /outbox state count drifted/);
});

// ── isolation and bookkeeping ────────────────────────────────────────────────

test('rendering through innerHTML is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nroot.innerHTML = model.label;\n';
    assert.throws(() => validatePhase7Sync(drifted), /innerHTML/);
});

test('performing transport in the module is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst response = fetch("/api/v1/mutations");\n';
    assert.throws(() => validatePhase7Sync(drifted), /own transport/);
});

test('reaching for a personal vault key is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst docs = storage.getItem("docvault_docs");\n';
    assert.throws(() => validatePhase7Sync(drifted), /reached for docvault_docs/);
});

test('a manifest that authorizes the wrong next story is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authorizes_on_approval = 'CF-P7-012';
    assert.throws(() => validatePhase7Sync(drifted), /Unsupported Phase 7/);
});

test('a unit test inventory that disagrees with the suite is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.tests.unit_count += 1;
    assert.throws(() => validatePhase7Sync(drifted), /Unit test inventory drifted/);
});

test('documenting a prohibition passes; performing it fails', () => {
    const documented = input();
    documented.journeySource += '\n// this module never calls fetch( directly\n';
    assert.equal(validatePhase7Sync(documented), true);
    assert.equal(code('const a = 1; // fetch(x)').includes('fetch(x)'), false);
});
