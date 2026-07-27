// Drift tests for the CF-P7-017 gate. Each case mutates one thing the fix
// depends on and asserts the gate rejects it, so the gate is known to bite.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7Dispatch } from '../scripts/cloudflare-phase-7-dispatch-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const input = () => ({
    manifest: json('config/cloudflare/phase-7-dispatch.json'),
    environmentSource: read('functions/_lib/identity/environment.ts'),
    apiShellSource: read('functions/_lib/api-shell.mjs'),
    routeSource: read('functions/api/v1/[[path]].ts'),
    identityRuntimeTestSource: read('tests/cloudflare/identity-runtime.workers.test.ts'),
    identityPrimitivesTestSource: read('tests/cloudflare/identity-primitives.workers.test.ts'),
    evidence: read('docs/collaboration-foundation/evidence/phase-7/CF-EV-P7-OPS-006.md'),
    decisionLog: read('docs/collaboration-foundation/decision-log.md')
});

test('the policy accepts the repository as it stands', () => {
    assert.equal(validatePhase7Dispatch(input()), true);
});

test('reverting the polarity fix is rejected', () => {
    const drifted = input();
    drifted.environmentSource = drifted.environmentSource
        .replace("input.COLLABORATION_ENABLED !== 'true'", "input.COLLABORATION_ENABLED !== 'false'");
    assert.throws(() => validatePhase7Dispatch(drifted), /requires the flag to equal 'true'/);
});

test('a polarity fix that leaves the old check present alongside it is rejected', () => {
    const drifted = input();
    drifted.environmentSource = drifted.environmentSource.replace(
        "if (mode === 'disabled' || input.COLLABORATION_ENABLED !== 'true') {",
        "if (mode === 'disabled' || input.COLLABORATION_ENABLED !== 'false' "
        + "|| input.COLLABORATION_ENABLED !== 'true') {");
    assert.throws(() => validatePhase7Dispatch(drifted), /inverted polarity/);
});

test('restoring the dead double-branch in api-shell.mjs is rejected', () => {
    const drifted = input();
    drifted.apiShellSource = drifted.apiShellSource.replace(
        "return errorResponse(503, 'COLLABORATION_UNAVAILABLE', requestId);",
        "const hasReviewedDisabledState = env.COLLABORATION_ENABLED === 'false';\n"
        + "        if (!hasReviewedDisabledState) {\n"
        + "            return errorResponse(503, 'COLLABORATION_UNAVAILABLE', requestId);\n"
        + "        }\n"
        + "        return errorResponse(503, 'COLLABORATION_UNAVAILABLE', requestId);");
    assert.throws(() => validatePhase7Dispatch(drifted), /discarded boolean/);
});

test('reordering the composed handlers ahead of the fallback is rejected', () => {
    const drifted = input();
    // A synthetic minimal source is enough: the gate only checks the left-to-
    // right text order of the four door names, not that the file compiles.
    drifted.routeSource = 'handlePreviewKeyFoundationApi(); handleIdentityRuntime(); '
        + 'handlePreviewCollaborationApi(); handleApiRequest();';
    assert.throws(() => validatePhase7Dispatch(drifted), /out of order/);
});

test('dropping the on/off dispatch contrast test is rejected', () => {
    const drifted = input();
    drifted.identityRuntimeTestSource = drifted.identityRuntimeTestSource.replace(
        "it('dispatches when COLLABORATION_ENABLED is true and refuses when it is anything else'",
        "it('some other test name'");
    assert.throws(() => validatePhase7Dispatch(drifted), /on\/off dispatch contrast test is missing/);
});

test('reverting a workers-test fixture to the old polarity is rejected', () => {
    const drifted = input();
    drifted.identityPrimitivesTestSource = drifted.identityPrimitivesTestSource
        .replace("COLLABORATION_ENABLED: 'true',", "COLLABORATION_ENABLED: 'false',");
    assert.throws(() => validatePhase7Dispatch(drifted), /no longer models an enabled configuration/);
});

test('an undecided manifest is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    delete drifted.manifest.chosen_option;
    assert.throws(() => validatePhase7Dispatch(drifted), /owner decision this story required was not recorded/);
});

test('a manifest claiming PASS without the decision log entry is rejected', () => {
    const drifted = input();
    drifted.decisionLog = drifted.decisionLog.replace(/CF-P7-017/g, 'nothing-here');
    assert.throws(() => validatePhase7Dispatch(drifted), /decision log does not record CF-P7-017/);
});

test('evidence missing the PASS status is rejected', () => {
    const drifted = input();
    drifted.evidence = drifted.evidence.replace('Status: **PASS**', 'Status: **PARTIAL**');
    assert.throws(() => validatePhase7Dispatch(drifted), /missing, unstatused, or misnamed/);
});
