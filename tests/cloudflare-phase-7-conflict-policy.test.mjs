// Drift tests for the CF-P7-010 gate. Each case mutates one thing and asserts
// the policy rejects it, so the gate is known to bite.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7Conflict, code, STORAGE_APIS }
    from '../scripts/cloudflare-phase-7-conflict-policy.mjs';
import {
    conflictDialogModel, dismissDialog, chooseResolution, requestAutomaticMerge
} from '../js/collaboration/conflict-dialog.js';
import { openConflict } from '../js/collaboration/conflict-resolution.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const sampleConflict = () => openConflict({
    conflictId: '77777777-7777-4777-8777-777777777777',
    documentId: '88888888-8888-4888-8888-888888888888',
    submittedBaseRevision: 3, currentRevision: 5, draft: new Uint8Array([1, 2, 3]), now: 1
});

const input = () => ({
    manifest: json('config/cloudflare/phase-7-conflict-dialog.json'),
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    journeySource: read('js/collaboration/conflict-dialog.js'),
    serviceSource: read('js/collaboration/conflict-resolution.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    unitTestSource: read('tests/collaboration-conflict-dialog.test.mjs'),
    journeyExports: {
        conflictDialogModel, dismissDialog, chooseResolution, requestAutomaticMerge,
        sampleConflict: sampleConflict()
    }
});

test('the policy accepts the repository as it stands', () => {
    assert.equal(validatePhase7Conflict(input()), true);
});

// ── U4 ───────────────────────────────────────────────────────────────────────

test('a dismissal that resolves the conflict is rejected', () => {
    const drifted = input();
    drifted.journeyExports.dismissDialog = () => ({ resolved: true, draftRetained: true });
    assert.throws(() => validatePhase7Conflict(drifted), /now resolves the conflict/);
});

test('a dismissal that drops the draft is rejected', () => {
    const drifted = input();
    drifted.journeyExports.dismissDialog = () => ({ resolved: false, draftRetained: false });
    assert.throws(() => validatePhase7Conflict(drifted), /drops the draft/);
});

test('a discard that needs no arming is rejected', () => {
    const drifted = input();
    drifted.journeyExports.chooseResolution = () => ({ state: 'discarded' });
    assert.throws(() => validatePhase7Conflict(drifted), /no longer requires arming/);
});

test('a discard that needs no confirmation is rejected', () => {
    const drifted = input();
    drifted.journeyExports.chooseResolution = args => {
        if (args.armed !== true) { const error = new Error('x'); error.code = 'DISCARD_NOT_ARMED'; throw error; }
        return { state: 'discarded' };
    };
    assert.throws(() => validatePhase7Conflict(drifted), /no longer requires confirmation/);
});

test('a discard offered with no held draft is rejected', () => {
    const drifted = input();
    drifted.journeyExports.chooseResolution = args => {
        if (args.armed !== true) { const e = new Error('x'); e.code = 'DISCARD_NOT_ARMED'; throw e; }
        if (args.confirmed !== true) { const e = new Error('x'); e.code = 'DISCARD_NOT_CONFIRMED'; throw e; }
        return { state: 'discarded' };
    };
    assert.throws(() => validatePhase7Conflict(drifted), /no draft to discard/);
});

test('offering an automatic merge is rejected', () => {
    const drifted = input();
    drifted.journeyExports.requestAutomaticMerge = () => ({ merged: true });
    assert.throws(() => validatePhase7Conflict(drifted), /no longer refused/);
});

test('a service that stops refusing a merge is rejected', () => {
    const drifted = input();
    drifted.serviceSource = drifted.serviceSource.replace(/AUTOMATIC_MERGE_PROHIBITED/g, 'OK');
    assert.throws(() => validatePhase7Conflict(drifted), /service no longer refuses/);
});

test('a second destructive resolution is rejected', () => {
    const drifted = input();
    drifted.journeyExports.conflictDialogModel = args => {
        const model = conflictDialogModel(args);
        return { ...model, options: model.options.map(option => ({ ...option, destroys: true })) };
    };
    assert.throws(() => validatePhase7Conflict(drifted), /destructive resolution count changed/);
});

test('a resolution with no stated consequence is rejected', () => {
    const drifted = input();
    drifted.journeyExports.conflictDialogModel = args => {
        const model = conflictDialogModel(args);
        return { ...model, options: model.options.map(option => ({ ...option, consequence: 'ok' })) };
    };
    assert.throws(() => validatePhase7Conflict(drifted), /no longer states its consequence/);
});

test('claiming a merge may be offered is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.gate_ux.automatic_merge_offered = true;
    assert.throws(() => validatePhase7Conflict(drifted), /may now be offered/);
});

test('dropping a resolution from the frozen four is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.gate_ux.resolutions = drifted.manifest.gate_ux.resolutions.slice(1);
    assert.throws(() => validatePhase7Conflict(drifted), /resolution set drifted/);
});

test('a contract that no longer lists the same four is rejected', () => {
    const drifted = input();
    drifted.contract = clone(drifted.contract);
    drifted.contract.inherited_vocabularies.conflict_resolutions = ['merge'];
    assert.throws(() => validatePhase7Conflict(drifted), /no longer lists exactly these four/);
});

// ── the draft is not held here ───────────────────────────────────────────────

test('every storage API is rejected in the dialog', () => {
    for (const api of STORAGE_APIS) {
        const drifted = input();
        drifted.journeySource += `\nconst stash = ${api}setItem;\n`;
        assert.throws(() => validatePhase7Conflict(drifted),
            new RegExp(`second persistence path via ${api.replace('.', '\\.')}`), api);
    }
});

test('no longer delegating to the CF-P6-007 service is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace("from './conflict-resolution.js'", "from './elsewhere.js'");
    assert.throws(() => validatePhase7Conflict(drifted), /no longer delegates/);
});

test('claiming a persistence path of its own is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.persistence.second_persistence_path_opened = true;
    assert.throws(() => validatePhase7Conflict(drifted), /persistence path of its own/);
});

// ── accessibility ────────────────────────────────────────────────────────────

test('a focus trap is rejected', () => {
    const drifted = input();
    drifted.journeySource += "\nroot.addEventListener('keydown', event => event.preventDefault());\n";
    assert.throws(() => validatePhase7Conflict(drifted), /beginning of a focus trap/);
});

test('claiming a focus trap in the manifest is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.accessibility.focus_trap = true;
    assert.throws(() => validatePhase7Conflict(drifted), /contract prohibits/);
});

test('losing the accessible name is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/aria-labelledby/g, 'data-title');
    assert.throws(() => validatePhase7Conflict(drifted), /lost its accessible name/);
});

test('unscoped dialog ids are rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/\$\{instanceId\}-/g, 'fixed-');
    assert.throws(() => validatePhase7Conflict(drifted), /no longer scoped/);
});

test('no longer moving or restoring focus is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/first\.focus\(\)/g, 'noop()');
    assert.throws(() => validatePhase7Conflict(drifted), /moved on open and restored/);
});

// ── isolation and bookkeeping ────────────────────────────────────────────────

test('rendering through innerHTML is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nroot.innerHTML = model.state;\n';
    assert.throws(() => validatePhase7Conflict(drifted), /innerHTML/);
});

test('performing transport in the dialog is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst response = fetch("/api/v1/documents");\n';
    assert.throws(() => validatePhase7Conflict(drifted), /own transport/);
});

test('a manifest that authorizes the wrong next story is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authorizes_on_approval = 'CF-P7-013';
    assert.throws(() => validatePhase7Conflict(drifted), /Unsupported Phase 7/);
});

test('a unit test inventory that disagrees with the suite is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.tests.unit_count += 1;
    assert.throws(() => validatePhase7Conflict(drifted), /Unit test inventory drifted/);
});

test('documenting a prohibition passes; performing it fails', () => {
    const documented = input();
    documented.journeySource += '\n// this dialog never touches localStorage\n';
    assert.equal(validatePhase7Conflict(documented), true);
    assert.equal(code('const a = 1; // localStorage').includes('localStorage'), false);
});
