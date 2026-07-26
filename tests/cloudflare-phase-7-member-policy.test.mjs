// Drift tests for the CF-P7-006 gate. Each case mutates one thing and asserts
// the policy rejects it, so the gate is known to bite.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7Members, code } from '../scripts/cloudflare-phase-7-member-policy.mjs';
import { memberActionDecision } from '../js/collaboration/member-list.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const input = () => ({
    manifest: json('config/cloudflare/phase-7-member-list.json'),
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    journeySource: read('js/collaboration/member-list.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    rbacDocument: read('docs/collaboration-foundation/domain-and-rbac.md'),
    unitTestSource: read('tests/collaboration-member-list.test.mjs'),
    journeyExports: { memberActionDecision }
});

const mutated = (drifted, file) => {
    assert.notEqual(drifted.journeySource, read(file),
        'the mutation did not apply, so this case would pass without testing anything');
    return drifted;
};

test('the policy accepts the repository as it stands', () => {
    assert.equal(validatePhase7Members(input()), true);
});

// ── U3 ───────────────────────────────────────────────────────────────────────

test('hiding a denied control is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.gate_ux.control_hidden_when_denied = true;
    assert.throws(() => validatePhase7Members(drifted), /hidden instead of explained/);
});

test('skipping a denied control in the renderer is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(
        'if (!decision.allowed) {', 'if (!decision.allowed) continue;\n            if (false) {');
    mutated(drifted, 'js/collaboration/member-list.js');
    assert.throws(() => validatePhase7Members(drifted), /skipped instead of rendered/);
});

test('styling instead of disabling is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace('button.disabled = true;', 'button.className += \' is-dim\';');
    mutated(drifted, 'js/collaboration/member-list.js');
    assert.throws(() => validatePhase7Members(drifted), /no longer programmatically disabled/);
});

test('dropping aria-describedby is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/aria-describedby/g, 'data-hint');
    mutated(drifted, 'js/collaboration/member-list.js');
    assert.throws(() => validatePhase7Members(drifted), /no longer associated with its control/);
});

test('reducing the reason to a tooltip is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace('reason.textContent = decision.reason;', 'reason.textContent = \'\';');
    mutated(drifted, 'js/collaboration/member-list.js');
    assert.throws(() => validatePhase7Members(drifted), /no longer rendered as text/);
});

test('claiming a denial may skip its reason is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.gate_ux.every_denial_states_a_reason = false;
    assert.throws(() => validatePhase7Members(drifted), /U3 claim drifted/);
});

// ── the frozen matrix ────────────────────────────────────────────────────────

test('permitting owner removal is rejected', () => {
    const drifted = input();
    drifted.journeyExports.memberActionDecision = args =>
        args.action === 'remove-member' && args.targetRole === 'owner'
            ? { allowed: true, reason: null }
            : memberActionDecision(args);
    assert.throws(() => validatePhase7Members(drifted), /may now remove an owner/);
});

test('letting an admin remove another admin is rejected', () => {
    const drifted = input();
    drifted.journeyExports.memberActionDecision = args =>
        args.action === 'remove-member' && args.actorRole === 'admin' && args.targetRole === 'admin'
            ? { allowed: true, reason: null }
            : memberActionDecision(args);
    assert.throws(() => validatePhase7Members(drifted), /remove another admin/);
});

test('letting an admin revoke an admin device is rejected', () => {
    const drifted = input();
    drifted.journeyExports.memberActionDecision = args =>
        args.action === 'revoke-device' && args.actorRole === 'admin' && args.targetRole === 'admin'
            ? { allowed: true, reason: null }
            : memberActionDecision(args);
    assert.throws(() => validatePhase7Members(drifted), /revoke another admin/);
});

test('letting a device without the key provision it is rejected', () => {
    const drifted = input();
    drifted.journeyExports.memberActionDecision = args =>
        args.action === 'provision-key' && args.actorKeyReady === false
            ? { allowed: true, reason: null }
            : memberActionDecision(args);
    assert.throws(() => validatePhase7Members(drifted), /may now provision it/);
});

test('a denial with no reason is rejected', () => {
    const drifted = input();
    drifted.journeyExports.memberActionDecision = args => {
        const decision = memberActionDecision(args);
        return decision.allowed ? decision : { allowed: false, reason: 'no' };
    };
    assert.throws(() => validatePhase7Members(drifted), /without a reason/);
});

test('a frozen matrix that stops denying owner removal is rejected', () => {
    const drifted = input();
    drifted.rbacDocument = drifted.rbacDocument
        .replace('| Remove Owner / last Owner | D | D | D | D | D | D |',
            '| Remove Owner / last Owner | A | D | D | D | D | D |');
    assert.throws(() => validatePhase7Members(drifted), /no longer denies owner removal/);
});

test('claiming the client enforces authorization is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.matrix.enforced_here = true;
    assert.throws(() => validatePhase7Members(drifted), /claims to enforce authorization/);
});

test('dropping an action from the matrix is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.matrix.actions = drifted.manifest.matrix.actions.slice(1);
    assert.throws(() => validatePhase7Members(drifted), /member action set drifted/);
});

// ── the inherited vocabulary ─────────────────────────────────────────────────

test('redefining the readiness vocabulary here is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nexport const KEY_READINESS = Object.freeze([\'ready\']);\n';
    assert.throws(() => validatePhase7Members(drifted), /redefines the inherited readiness/);
});

test('no longer importing the shared vocabulary is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace("from './device-initialization.js'", "from './somewhere-else.js'");
    mutated(drifted, 'js/collaboration/member-list.js');
    assert.throws(() => validatePhase7Members(drifted), /no longer reused from CF-P7-005/);
});

// ── isolation and bookkeeping ────────────────────────────────────────────────

test('reaching for a personal vault key is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst docs = storage.getItem("docvault_docs");\n';
    assert.throws(() => validatePhase7Members(drifted), /reached for docvault_docs/);
});

test('rendering through innerHTML is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nrow.innerHTML = member.displayLogin;\n';
    assert.throws(() => validatePhase7Members(drifted), /innerHTML/);
});

test('performing transport in the module is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst response = fetch("/api/v1/workspaces");\n';
    assert.throws(() => validatePhase7Members(drifted), /own transport/);
});

test('a manifest that authorizes the wrong next story is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authorizes_on_approval = 'CF-P7-009';
    assert.throws(() => validatePhase7Members(drifted), /Unsupported Phase 7/);
});

test('a unit test inventory that disagrees with the suite is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.tests.unit_count += 1;
    assert.throws(() => validatePhase7Members(drifted), /Unit test inventory drifted/);
});

test('documenting a prohibition passes; performing it fails', () => {
    const documented = input();
    documented.journeySource += '\n// this module never calls fetch( directly\n';
    assert.equal(validatePhase7Members(documented), true);
    assert.equal(code('const a = 1; // fetch(x)').includes('fetch(x)'), false);
});
