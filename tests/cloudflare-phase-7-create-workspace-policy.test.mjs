// Drift tests for the CF-P7-004 gate. Each case mutates one thing and asserts
// the policy rejects it, so the gate is known to bite.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7CreateWorkspace, code }
    from '../scripts/cloudflare-phase-7-create-workspace-policy.mjs';
import { PRESENTATION_BY_CODE, CREATE_WORKSPACE_CODES, NAME_RULE }
    from '../js/collaboration/create-workspace.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const input = () => ({
    manifest: json('config/cloudflare/phase-7-create-workspace.json'),
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    journeySource: read('js/collaboration/create-workspace.js'),
    journeyExports: {
        PRESENTATION_BY_CODE: { ...PRESENTATION_BY_CODE },
        CREATE_WORKSPACE_CODES: [...CREATE_WORKSPACE_CODES],
        NAME_RULE: { ...NAME_RULE }
    },
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    serverSource: read('functions/_lib/workspaces/workspace-bootstrap.ts'),
    unitTestSource: read('tests/collaboration-create-workspace.test.mjs')
});

test('the policy accepts the repository as it stands', () => {
    assert.equal(validatePhase7CreateWorkspace(input()), true);
});

test('documenting a prohibition passes; performing it fails', () => {
    const documented = input();
    documented.journeySource += '\n// this module never calls fetch( directly\n';
    assert.equal(validatePhase7CreateWorkspace(documented), true);

    const performed = input();
    performed.journeySource += '\nconst response = fetch("/api/v1/workspaces");\n';
    assert.throws(() => validatePhase7CreateWorkspace(performed), /own transport/);
});

// ── the ordering rule ────────────────────────────────────────────────────────

test('sealing key material before the binding arrives is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace('const binding = requireBinding(',
            'const early = keys.sealCreatorEnvelope({}); const binding = requireBinding(');
    assert.throws(() => validatePhase7CreateWorkspace(drifted),
        /before the bootstrap intent returns/);
});

test('creating the workspace before sealing its envelope is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace('        step(\'sealing\');',
            '        const early = api.createWorkspace({}); step(\'sealing\');');
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /before its creator envelope/);
});

test('minting a second idempotency key is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace('step(\'creating\');', 'const second = newIdempotencyKey(); step(\'creating\');');
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /A second idempotency key/);
});

test('sending a different key on the create is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(
        /idempotencyKey: requestKey,\n            workspaceId: binding.workspaceId/,
        'idempotencyKey: newIdempotencyKey(),\n            workspaceId: binding.workspaceId'
    );
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /idempotency key/);
});

test('declaring automatic retry is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.journey.automatic_retry = true;
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /retry a create on its own/);
});

test('dropping the device comparison before sealing is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/BINDING_DEVICE_MISMATCH/g, 'IGNORED');
    assert.throws(() => validatePhase7CreateWorkspace(drifted),
        /sealed to a device the server did not bind/);
});

test('dropping the created-id comparison is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/WORKSPACE_ID_MISMATCH/g, 'IGNORED');
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /compared before it becomes/);
});

test('minting the workspace id on the client is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst mine = crypto.randomUUID();\n';
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /mints its own identifier/);
});

test('no longer selecting the created workspace is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace('selection.write(', 'noop(');
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /active selection/);
});

// ── the mirrored name rule ───────────────────────────────────────────────────

test('a bound that no longer matches the server it mirrors is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.name_rule.max_code_points = 120;
    drifted.journeyExports.NAME_RULE.maxCodePoints = 120;
    assert.throws(() => validatePhase7CreateWorkspace(drifted),
        /no longer matches the server it mirrors/);
});

test('counting UTF-16 units instead of code points is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace('[...value].length', 'value.length');
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /counting code points/);
});

test('claiming the client check is authoritative is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.name_rule.server_remains_the_authority = false;
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /claims to be authoritative/);
});

test('losing a name rejection reason is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/'control-character'/g, "'bad'");
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /cannot report control-character/);
});

// ── preconditions ────────────────────────────────────────────────────────────

test('hiding a control the user cannot use is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.preconditions.blocked_control_hidden = true;
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /hidden instead of explained/);
});

test('allowing a control to fail only on submit is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.preconditions.fails_only_on_submit = true;
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /fail on submit/);
});

test('dropping aria-disabled from the blocked submit is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/aria-disabled/g, 'data-off');
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /no longer states its reason/);
});

test('removing the route into the device journey is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/device-setup-open/g, 'nothing');
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /offered the device journey/);
});

test('removing a step shape leaves colour alone and is rejected', () => {
    const drifted = input();
    drifted.styleSource = drifted.styleSource.replace(/collab-create__shape--stopped/g, 'x');
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /Step state stopped has no shape/);
});

// ── the error taxonomy, compared against the frozen contract ─────────────────

test('presenting a code differently from the frozen contract is rejected', () => {
    const drifted = input();
    drifted.journeyExports.PRESENTATION_BY_CODE.OPERATION_NOT_PERMITTED = 'error';
    assert.throws(() => validatePhase7CreateWorkspace(drifted),
        /frozen contract says role-disabled-explanation/);
});

test('dropping a code from the presentation table is rejected', () => {
    const drifted = input();
    delete drifted.journeyExports.PRESENTATION_BY_CODE.CSRF_REJECTED;
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /exactly the frozen taxonomy/);
});

test('making an unreachable code reachable is rejected', () => {
    const drifted = input();
    drifted.journeyExports.CREATE_WORKSPACE_CODES.push('RESOURCE_NOT_FOUND');
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /reachable code set drifted/);
});

test('flattening an unexpected code into error is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.error_mapping.unexpected_code_reported_not_flattened = false;
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /error mapping claim drifted/);
});

// ── isolation ────────────────────────────────────────────────────────────────

test('reaching for a personal vault key is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst docs = storage.getItem("docvault_docs");\n';
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /reached for docvault_docs/);
});

test('rendering through innerHTML is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nroot.innerHTML = model.name;\n';
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /innerHTML/);
});

test('an eager collaboration script tag is rejected', () => {
    const drifted = input();
    drifted.indexHtml += '<script type="module" src="js/collaboration/create-workspace.js"></script>';
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /eager script tag/);
});

test('precaching a collaboration module is rejected', () => {
    const drifted = input();
    drifted.serviceWorker += "\nPRECACHE.push('js/collaboration/create-workspace.js');\n";
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /service worker precache/);
});

// ── gate bookkeeping ─────────────────────────────────────────────────────────

test('a manifest that authorizes the wrong next story is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authorizes_on_approval = 'CF-P7-006';
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /Unsupported Phase 7/);
});

test('claiming a surface this story does not own is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.surfaces = ['create-workspace', 'audit-activity'];
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /owned surface set drifted/);
});

test('a unit test inventory that disagrees with the suite is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.tests.unit_count += 1;
    assert.throws(() => validatePhase7CreateWorkspace(drifted), /Unit test inventory drifted/);
});

test('comment stripping keeps code and drops comments', () => {
    assert.equal(code('const a = 1; // fetch(x)').includes('fetch(x)'), false);
    assert.equal(code('const a = fetch(x);').includes('fetch(x)'), true);
    assert.equal(code("const u = 'https://x.test/a';").includes('https://x.test/a'), true);
});
