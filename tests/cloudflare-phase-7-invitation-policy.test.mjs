// Drift tests for the CF-P7-007 gate. Each case mutates one thing and asserts
// the policy rejects it, so the gate is known to bite.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7Invitations, code, LEAK_SINKS }
    from '../scripts/cloudflare-phase-7-invitation-policy.mjs';
import { invitationDecision, holdAcceptanceUrl } from '../js/collaboration/invitations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const input = () => ({
    manifest: json('config/cloudflare/phase-7-invitations.json'),
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    journeySource: read('js/collaboration/invitations.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    apiContract: read('docs/collaboration-foundation/api-contract.md'),
    unitTestSource: read('tests/collaboration-invitations.test.mjs'),
    journeyExports: { invitationDecision, holdAcceptanceUrl }
});

test('the policy accepts the repository as it stands', () => {
    assert.equal(validatePhase7Invitations(input()), true);
});

// ── the secret ───────────────────────────────────────────────────────────────

test('every leak sink is rejected', () => {
    for (const sink of LEAK_SINKS) {
        const drifted = input();
        drifted.journeySource += `\nconst leak = ${sink}setItem;\n`;
        assert.throws(() => validatePhase7Invitations(drifted),
            new RegExp(`reaches for ${sink.replace('.', '\\.')}`), sink);
    }
});

test('rendering the link into an anchor is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nlink.href = model.issuedUrl;\n';
    assert.throws(() => validatePhase7Invitations(drifted), /browser history/);
});

test('accepting a token outside the fragment is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/TOKEN_NOT_IN_FRAGMENT/g, 'OK');
    assert.throws(() => validatePhase7Invitations(drifted), /outside its fragment/);
});

test('accepting a query string is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace(/TOKEN_MAY_NOT_REACH_A_QUERY_STRING/g, 'OK');
    assert.throws(() => validatePhase7Invitations(drifted), /query string is no longer refused/);
});

test('a holder that can be read after clearing is rejected', () => {
    const drifted = input();
    drifted.journeyExports.holdAcceptanceUrl = url => ({
        oneTimeOnly: true, recoverable: false, read: () => url, cleared: () => true,
        clear: () => true
    });
    assert.throws(() => validatePhase7Invitations(drifted), /can still be read/);
});

test('a holder claiming the value is recoverable is rejected', () => {
    const drifted = input();
    drifted.journeyExports.holdAcceptanceUrl = url => ({
        ...holdAcceptanceUrl(url), recoverable: true
    });
    assert.throws(() => validatePhase7Invitations(drifted), /cannot be recovered/);
});

test('claiming the token may be stored is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.secret_handling.stored_anywhere = true;
    assert.throws(() => validatePhase7Invitations(drifted), /stored_anywhere/);
});

test('dropping the readonly field is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace("setAttribute('readonly', 'readonly')", "setAttribute('data-x', '1')");
    assert.throws(() => validatePhase7Invitations(drifted), /readonly field/);
});

test('an API contract that no longer promises a one-time fragment is rejected', () => {
    const drifted = input();
    drifted.apiContract = drifted.apiContract
        .replace('appears only in the URL fragment, is returned once', 'may appear anywhere');
    assert.throws(() => validatePhase7Invitations(drifted), /no longer says the token/);
});

// ── authority ────────────────────────────────────────────────────────────────

test('letting an admin invite an admin is rejected', () => {
    const drifted = input();
    drifted.journeyExports.invitationDecision = args =>
        args.role === 'admin' ? { allowed: true, reason: null } : invitationDecision(args);
    assert.throws(() => validatePhase7Invitations(drifted), /may now invite an admin/);
});

test('letting an editor invite is rejected', () => {
    const drifted = input();
    drifted.journeyExports.invitationDecision = args =>
        args.actorRole === 'editor' ? { allowed: true, reason: null } : invitationDecision(args);
    assert.throws(() => validatePhase7Invitations(drifted), /editor may now invite/);
});

test('a denial with no reason is rejected', () => {
    const drifted = input();
    drifted.journeyExports.invitationDecision = args => {
        const decision = invitationDecision(args);
        return decision.allowed ? decision : { allowed: false, reason: 'no' };
    };
    assert.throws(() => validatePhase7Invitations(drifted), /denies without a reason/);
});

test('making an owner invitable is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authority.invitable_roles = ['owner', 'admin', 'editor', 'viewer'];
    assert.throws(() => validatePhase7Invitations(drifted), /invitable role set drifted/);
});

test('claiming the client enforces authorization is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authority.enforced_here = true;
    assert.throws(() => validatePhase7Invitations(drifted), /claims to enforce authorization/);
});

// ── presentation and isolation ───────────────────────────────────────────────

test('hiding a denied control is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.presentation.denied_control_hidden = true;
    assert.throws(() => validatePhase7Invitations(drifted), /presentation claim drifted/);
});

test('unscoped reason ids are rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/\$\{instanceId\}-/g, 'fixed-');
    assert.throws(() => validatePhase7Invitations(drifted), /no longer scoped/);
});

test('a quiet warning is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/role', 'alert'/g, "role', 'note'");
    assert.throws(() => validatePhase7Invitations(drifted), /announced assertively/);
});

test('rendering through innerHTML is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nrow.innerHTML = invitation.targetDisplayLogin;\n';
    assert.throws(() => validatePhase7Invitations(drifted), /innerHTML/);
});

test('performing transport in the module is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst response = fetch("/api/v1/invitations");\n';
    assert.throws(() => validatePhase7Invitations(drifted), /own transport/);
});

test('a manifest that authorizes the wrong next story is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authorizes_on_approval = 'CF-P7-010';
    assert.throws(() => validatePhase7Invitations(drifted), /Unsupported Phase 7/);
});

test('a unit test inventory that disagrees with the suite is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.tests.unit_count += 1;
    assert.throws(() => validatePhase7Invitations(drifted), /Unit test inventory drifted/);
});

test('documenting a prohibition passes; performing it fails', () => {
    const documented = input();
    documented.journeySource += '\n// this module never touches localStorage directly\n';
    assert.equal(validatePhase7Invitations(documented), true);
    assert.equal(code('const a = 1; // localStorage').includes('localStorage'), false);
});
