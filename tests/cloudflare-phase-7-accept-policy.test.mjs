// Drift tests for the CF-P7-008 gate. Each case mutates one thing and asserts
// the policy rejects it, so the gate is known to bite.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7Accept, code, LEAK_SINKS }
    from '../scripts/cloudflare-phase-7-accept-policy.mjs';
import { takeTokenFromFragment } from '../js/collaboration/invitation-accept.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const input = () => ({
    manifest: json('config/cloudflare/phase-7-invitation-accept.json'),
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    journeySource: read('js/collaboration/invitation-accept.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    apiContract: read('docs/collaboration-foundation/api-contract.md'),
    unitTestSource: read('tests/collaboration-invitation-accept.test.mjs'),
    journeyExports: { takeTokenFromFragment }
});

test('the policy accepts the repository as it stands', () => {
    assert.equal(validatePhase7Accept(input()), true);
});

// ── the token in the address bar ─────────────────────────────────────────────

test('pushing a history entry instead of replacing is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace('history.replaceState(', 'history.pushState(');
    assert.throws(() => validatePhase7Accept(drifted), /restore the token/);
});

test('returning the token before clearing the bar is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(
        /history\.replaceState\(null, '', `\$\{location\.pathname\}\$\{location\.search\}`\);/,
        '');
    assert.throws(() => validatePhase7Accept(drifted), /no longer cleared|before the address bar/);
});

test('a reader that does not clear the bar is rejected', () => {
    const drifted = input();
    drifted.journeyExports.takeTokenFromFragment = () => ({ token: 'a'.repeat(43), cleared: true });
    assert.throws(() => validatePhase7Accept(drifted), /no longer clears the address bar/);
});

test('a replacement URL that still carries the token is rejected', () => {
    const drifted = input();
    drifted.journeyExports.takeTokenFromFragment = ({ history }) => {
        const token = 'a'.repeat(43);
        history.replaceState(null, '', `/app#/invite/${token}`);
        return { token, cleared: true };
    };
    assert.throws(() => validatePhase7Accept(drifted), /still carries the token/);
});

test('rewriting the bar when there is no token is rejected', () => {
    const drifted = input();
    drifted.journeyExports.takeTokenFromFragment = ({ history }) => {
        history.replaceState(null, '', '/app');
        return { token: 'a'.repeat(43), cleared: true };
    };
    assert.throws(() => validatePhase7Accept(drifted), /no token to hide/);
});

test('every leak sink is rejected', () => {
    for (const sink of LEAK_SINKS) {
        const drifted = input();
        drifted.journeySource += `\nconst leak = ${sink}setItem;\n`;
        assert.throws(() => validatePhase7Accept(drifted),
            new RegExp(`reaches for ${sink.replace('.', '\\.')}`), sink);
    }
});

test('sending the token outside the body is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace('bootstrapInvitation({ token })', 'bootstrapInvitation(`/invite/${token}`)');
    assert.throws(() => validatePhase7Accept(drifted), /no longer sent in the request body/);
});

test('an API contract that drops the replacement requirement is rejected', () => {
    const drifted = input();
    drifted.apiContract = drifted.apiContract
        .replace('removes it from the address bar using history replacement', 'keeps it');
    assert.throws(() => validatePhase7Accept(drifted), /no longer requires history replacement/);
});

test('claiming a push is used is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.token_from_address_bar.history_push_used = true;
    assert.throws(() => validatePhase7Accept(drifted), /history_push_used/);
});

// ── the review and acceptance ────────────────────────────────────────────────

test('dropping a review state is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.review.states = ['pending', 'expired'];
    assert.throws(() => validatePhase7Accept(drifted), /review state set drifted/);
});

test('a state the surface cannot render is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/'consumed'/g, "'used'")
        .replace(/consumed: \{/, 'used: {');
    assert.throws(() => validatePhase7Accept(drifted), /cannot render consumed/);
});

test('dropping the identity-mismatch check is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace(/identityMatch === false/g, 'false');
    assert.throws(() => validatePhase7Accept(drifted), /no longer named before submit/);
});

test('accepting a membership beyond pending_key is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/MEMBERSHIP_NOT_PENDING_KEY/g, 'OK');
    assert.throws(() => validatePhase7Accept(drifted), /no longer refused/);
});

test('claiming acceptance conveys a usable key is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.acceptance.conveys_usable_key = true;
    assert.throws(() => validatePhase7Accept(drifted), /does not/);
});

test('no longer stating the outcome before the choice is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/pendingKeyAfterAccept/g, 'later');
    assert.throws(() => validatePhase7Accept(drifted), /what acceptance actually gets you/);
});

test('redefining readiness instead of reusing it is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace("from './device-initialization.js'", "from './elsewhere.js'");
    assert.throws(() => validatePhase7Accept(drifted), /no longer reused from CF-P7-005/);
});

// ── presentation, isolation, bookkeeping ─────────────────────────────────────

test('unscoped reason ids are rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/\$\{instanceId\}-/g, 'fixed-');
    assert.throws(() => validatePhase7Accept(drifted), /no longer scoped/);
});

test('hiding a denied control is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.presentation.denied_control_hidden = true;
    assert.throws(() => validatePhase7Accept(drifted), /presentation claim drifted/);
});

test('rendering through innerHTML is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nroot.innerHTML = model.review.workspaceDisplayName;\n';
    assert.throws(() => validatePhase7Accept(drifted), /innerHTML/);
});

test('performing transport in the module is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst response = fetch("/api/v1/invitations/accept");\n';
    assert.throws(() => validatePhase7Accept(drifted), /own transport/);
});

test('a manifest that authorizes the wrong next story is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authorizes_on_approval = 'CF-P7-011';
    assert.throws(() => validatePhase7Accept(drifted), /Unsupported Phase 7/);
});

test('a unit test inventory that disagrees with the suite is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.tests.unit_count += 1;
    assert.throws(() => validatePhase7Accept(drifted), /Unit test inventory drifted/);
});

test('documenting a prohibition passes; performing it fails', () => {
    const documented = input();
    documented.journeySource += '\n// this module never calls pushState\n';
    assert.equal(validatePhase7Accept(documented), true);
    assert.equal(code('const a = 1; // pushState').includes('pushState'), false);
});
