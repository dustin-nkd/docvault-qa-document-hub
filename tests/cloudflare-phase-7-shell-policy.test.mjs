// The Phase 7 policies must reject drift, not merely pass on the happy path.
// Each case mutates one field of a known-good input and asserts the gate bites.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7Shell } from '../scripts/cloudflare-phase-7-shell-policy.mjs';
import { validatePhase7Contract } from '../scripts/cloudflare-phase-7-contract-policy.mjs';
import { validatePhase7Sprint } from '../scripts/cloudflare-phase-7-sprint-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const shellInput = () => ({
    manifest: json('config/cloudflare/phase-7-shell.json'),
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    deploymentSource: read('js/deployment.js'),
    baseStatesSource: read('js/collaboration/base-states.js'),
    shellSource: read('js/collaboration/shell.js'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    styleSource: read('style.css'),
    unitTestSource: read('tests/collaboration-shell.test.mjs')
});

const contractInput = () => ({
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    contractSource: read('docs/collaboration-foundation/phase-7-ui-contract.md'),
    plan: json('config/cloudflare/phase-7-sprint-plan.json'),
    conflictSource: read('js/collaboration/conflict-resolution.js'),
    outboxSource: read('js/collaboration/outbox.js'),
    documentServiceSource: read('functions/_lib/documents/document-service.ts')
});

const sprintInput = () => ({
    plan: json('config/cloudflare/phase-7-sprint-plan.json'),
    sprintSource: read('docs/collaboration-foundation/phase-7-sprint.md'),
    phase6Exit: json('config/cloudflare/phase-6-exit-gate.json')
});

// ── happy path ───────────────────────────────────────────────────────────────

test('the three Phase 7 policies accept the repository as it stands', () => {
    assert.equal(validatePhase7Shell(shellInput()), true);
    assert.equal(validatePhase7Contract(contractInput()), true);
    assert.equal(validatePhase7Sprint(sprintInput()), true);
});

// ── shell drift ──────────────────────────────────────────────────────────────

test('an eager collaboration script tag is rejected', () => {
    const input = shellInput();
    input.indexHtml += '\n<script defer src="js/collaboration/shell.js"></script>';
    assert.throws(() => validatePhase7Shell(input), /eager script tag/);
});

test('precaching a collaboration module is rejected', () => {
    const input = shellInput();
    input.serviceWorker += "\n'./js/collaboration/shell.js',";
    assert.throws(() => validatePhase7Shell(input), /service worker precache/);
});

test('moving the deployment predicate into the collaboration namespace is rejected', () => {
    const input = shellInput();
    input.manifest = clone(input.manifest);
    input.manifest.modules.deployment = 'js/collaboration/deployment.js';
    assert.throws(() => validatePhase7Shell(input), /collaboration namespace/);
});

test('dropping the reason requirement from a denial state is rejected', () => {
    const input = shellInput();
    input.manifest = clone(input.manifest);
    input.manifest.state_signals.reason_required_for = ['error'];
    assert.throws(() => validatePhase7Shell(input), /owing an explanation/);
});

test('colour-only state signalling is rejected', () => {
    const input = shellInput();
    input.manifest = clone(input.manifest);
    input.manifest.state_signals.colour_only = true;
    assert.throws(() => validatePhase7Shell(input), /Colour-only/);
});

test('losing a distinct state shape is rejected', () => {
    const input = shellInput();
    input.styleSource = input.styleSource.replace(/collab-state__shape--triangle/g, 'x-gone');
    assert.throws(() => validatePhase7Shell(input), /distinct shape/);
});

test('reaching for personal storage from the shell is rejected', () => {
    const input = shellInput();
    input.shellSource += "\nconst leak = localStorage.getItem('docvault_docs');";
    assert.throws(() => validatePhase7Shell(input), /personal storage/);
});

test('rendering through innerHTML is rejected, but discussing it is not', () => {
    const input = shellInput();
    input.baseStatesSource += '\nnode.innerHTML = untrusted;';
    assert.throws(() => validatePhase7Shell(input), /innerHTML/);

    const commented = shellInput();
    commented.baseStatesSource += '\n// never innerHTML here';
    assert.equal(validatePhase7Shell(commented), true);
});

test('a drifted unit test count is rejected', () => {
    const input = shellInput();
    input.manifest = clone(input.manifest);
    input.manifest.tests.unit_count += 1;
    assert.throws(() => validatePhase7Shell(input), /Unit test inventory drifted/);
});

test('a surface this story does not own in the contract is rejected', () => {
    const input = shellInput();
    input.contract = clone(input.contract);
    input.contract.surfaces.find(item => item.id === 'base-states').owner = 'CF-P7-009';
    assert.throws(() => validatePhase7Shell(input), /not owned by CF-P7-002/);
});

// ── contract drift ───────────────────────────────────────────────────────────

test('a conflict resolution the implementation does not export is rejected', () => {
    const input = contractInput();
    input.contract = clone(input.contract);
    input.contract.inherited_vocabularies.conflict_resolutions.push('auto-merge');
    assert.throws(() => validatePhase7Contract(input), /diverge from the implementation/);
});

test('a transition out of the terminal sync state is rejected', () => {
    const input = contractInput();
    input.contract = clone(input.contract);
    input.contract.sync_state_machine.transitions.push({ from: 'Access removed', to: 'Saved' });
    assert.throws(() => validatePhase7Contract(input), /terminal/);
});

test('an unmapped server error code is rejected', () => {
    const input = contractInput();
    input.contract = clone(input.contract);
    input.contract.error_mapping = input.contract.error_mapping
        .filter(item => item.code !== 'RATE_LIMITED');
    assert.throws(() => validatePhase7Contract(input), /taxonomy/);
});

test('a presentation without an explanation is rejected', () => {
    const input = contractInput();
    input.contract = clone(input.contract);
    input.contract.error_mapping[0].explains_reason = false;
    assert.throws(() => validatePhase7Contract(input), /without an explanation/);
});

test('lowering the accessibility floor is rejected', () => {
    const input = contractInput();
    input.contract = clone(input.contract);
    input.contract.accessibility.focus_trap_permitted = true;
    assert.throws(() => validatePhase7Contract(input), /Focus traps/);
});

test('an unreachable sync state is rejected', () => {
    const input = contractInput();
    input.contract = clone(input.contract);
    input.contract.sync_state_machine.transitions =
        input.contract.sync_state_machine.transitions.filter(item => item.to !== 'Offline');
    assert.throws(() => validatePhase7Contract(input), /unreachable/);
});

// ── sprint drift ─────────────────────────────────────────────────────────────

test('a broken gate chain is rejected', () => {
    const input = sprintInput();
    input.plan = clone(input.plan);
    input.plan.stories[3].entry_gate = 'P7-G0';
    assert.throws(() => validatePhase7Sprint(input), /Gate chain broken/);
});

test('authorizing remote work outside P7-G4 is rejected', () => {
    const input = sprintInput();
    input.plan = clone(input.plan);
    input.plan.authorization.remote_changes_authorized = true;
    assert.throws(() => validatePhase7Sprint(input), /remote authorization/);
});

test('dropping a requested surface is rejected', () => {
    const input = sprintInput();
    input.plan = clone(input.plan);
    input.plan.surfaces = input.plan.surfaces.filter(item => item.id !== 'audit-activity');
    assert.throws(() => validatePhase7Sprint(input), /surface inventory/);
});

test('deferring copy-to-workspace without recording the service still enforces it is rejected', () => {
    const input = sprintInput();
    input.plan = clone(input.plan);
    input.plan.deferred_to_phase_8
        .find(item => /Copy to workspace/i.test(item.item)).service_already_enforces = false;
    assert.throws(() => validatePhase7Sprint(input), /service still enforces/);
});

test('planning Phase 7 while Phase 6 is open is rejected', () => {
    const input = sprintInput();
    input.phase6Exit = clone(input.phase6Exit);
    input.phase6Exit.exit_gate_granted = false;
    assert.throws(() => validatePhase7Sprint(input), /Phase 6 is open/);
});
