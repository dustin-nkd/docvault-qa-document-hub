// Drift tests for the CF-P7-013 gate. Each case breaks one thing and asserts
// the policy rejects it, so the gate is known to bite rather than assumed to.
//
// Source mutations assert the replacement actually changed the text before
// asserting the policy rejects it. Git renormalises line endings on checkout, so
// a pattern written with \n can silently fail to match on a CRLF working copy —
// leaving a test that passes while checking nothing at all.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7Preview, PERSONAL_KEYS }
    from '../scripts/cloudflare-phase-7-preview-policy.mjs';
import * as entry from '../js/collaboration/entry.js';
import * as services from '../js/collaboration/services.js';
import * as apiClient from '../js/collaboration/api-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const manifestPath = 'config/cloudflare/phase-7-preview-integration.json';

const input = () => ({
    manifest: json(manifestPath),
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    apiContract: read('docs/collaboration-foundation/api-contract.md'),
    entry,
    services,
    apiClient,
    panelSource: read('js/collaboration/surface-panel.js'),
    entrySource: read('js/collaboration/entry.js'),
    deploymentSource: read('js/deployment.js'),
    evidence: read(json(manifestPath).preview.evidence)
});

/** Replace and prove the replacement landed, so a no-op mutation cannot pass. */
const mutated = (source, pattern, replacement) => {
    const result = source.replace(pattern, replacement);
    assert.notEqual(result, source, `mutation did not apply: ${pattern}`);
    return result;
};

test('the policy accepts the repository as it stands', async () => {
    assert.equal(await validatePhase7Preview(input()), true);
});

// ── the manifest is the story it claims to be ────────────────────────────────

test('a manifest for another story is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.story = 'CF-P7-012';
    await assert.rejects(() => validatePhase7Preview(drifted), /Unsupported Phase 7 Preview/);
});

test('a manifest that authorizes the wrong next story is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authorizes_on_approval = 'CF-P8-001';
    await assert.rejects(() => validatePhase7Preview(drifted), /Unsupported Phase 7 Preview/);
});

test('qualifying against anything but Preview is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.environment = 'production';
    await assert.rejects(() => validatePhase7Preview(drifted), /only qualify against Preview/);
});

// ── the frozen twelve ────────────────────────────────────────────────────────

test('a surface dropped from the composition is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.composition.surfaces_in_panel =
        drifted.manifest.composition.surfaces_in_panel.slice(1);
    await assert.rejects(() => validatePhase7Preview(drifted),
        /does not account for every frozen surface/);
});

test('a thirteenth surface invented in the composition is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.composition.surfaces_in_panel.push('document-editor');
    await assert.rejects(() => validatePhase7Preview(drifted),
        /does not account for every frozen surface/);
});

test('claiming to add a primitive is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.composition.adds_primitive = true;
    await assert.rejects(() => validatePhase7Preview(drifted), /claims to add a primitive/);
});

// ── the composition is driven, so breaking it must fail the gate ─────────────

test('a panel that mounts no surface is rejected', async () => {
    const drifted = input();
    drifted.entry = {
        // A composition that renders the chrome and nothing else is exactly the
        // state this story found, and the gate has to see it.
        startCollaboration: async ({ document: doc }) => {
            const container = doc.getElementById('collaboration-root');
            container.replaceChildren();
            return container;
        }
    };
    await assert.rejects(() => validatePhase7Preview(drifted), /never mounted/);
});

test('a surface left on loading after every read returned is rejected', async () => {
    const drifted = input();
    const real = entry.startCollaboration;
    drifted.entry = {
        // The exact defect: the panel composes, and nothing feeds it.
        startCollaboration: input_ => real({ ...input_, storage: null, environment: null })
    };
    await assert.rejects(() => validatePhase7Preview(drifted),
        /left on loading|never reached the surface/);
});

test('dropping the no-permanent-loading budget is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.budgets.surfaces_left_on_loading_after_reads = 1;
    await assert.rejects(() => validatePhase7Preview(drifted), /no-permanent-loading budget/);
});

test('a route called that the manifest never declared is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.composition.routes_exercised =
        drifted.manifest.composition.routes_exercised.filter(path => !path.endsWith('/members'));
    await assert.rejects(() => validatePhase7Preview(drifted),
        /does not declare/);
});

test('a declared route that is not in the frozen catalog is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.composition.routes_exercised.push('/api/v1/workspaces/{workspaceId}/exports2');
    await assert.rejects(() => validatePhase7Preview(drifted), /not in the frozen catalog/);
});

// ── the personal boundary and the lazy budget ────────────────────────────────

test('dropping the zero-modules-on-startup budget is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.budgets.collaboration_modules_on_personal_startup = 1;
    await assert.rejects(() => validatePhase7Preview(drifted), /zero-modules-on-startup/);
});

test('an eager import of the entry is rejected', async () => {
    const drifted = input();
    drifted.deploymentSource = mutated(drifted.deploymentSource,
        /import\(\s*'\.\/collaboration\/entry\.js'\s*\)/,
        "requireCollaborationEntry('./collaboration/entry.js')");
    await assert.rejects(() => validatePhase7Preview(drifted), /dynamic import/);
});

test('an opener that stops handing the entry its address bar is rejected', async () => {
    const drifted = input();
    drifted.deploymentSource = mutated(drifted.deploymentSource, /\blocation:\s*location\b/,
        'unusedLocation: location');
    await assert.rejects(() => validatePhase7Preview(drifted), /no longer hands the entry/);
});

test('an opener that stops handing the entry a store is rejected', async () => {
    const drifted = input();
    drifted.deploymentSource = mutated(drifted.deploymentSource, /\bstorage:\s*readableStore\(\)/,
        'unusedStorage: readableStore()');
    await assert.rejects(() => validatePhase7Preview(drifted), /no longer hands the entry/);
});

test('a panel that renders through innerHTML is rejected', async () => {
    const drifted = input();
    drifted.panelSource = `${drifted.panelSource}\nsection.innerHTML = '<b>x</b>';\n`;
    await assert.rejects(() => validatePhase7Preview(drifted), /innerHTML/);
});

test('the entry performing its own transport is rejected', async () => {
    const drifted = input();
    drifted.entrySource = `${drifted.entrySource}\nconst probe = () => fetch('/api/v1/session');\n`;
    await assert.rejects(() => validatePhase7Preview(drifted), /performs its own transport/);
});

test('the personal keys the boundary protects are the ones checked', () => {
    assert.deepEqual([...PERSONAL_KEYS].sort(),
        ['DocStorage', 'docvault_deleted_ids', 'docvault_docs', 'docvault_sync_pending']);
});

// ── the adapter's own refusal ────────────────────────────────────────────────

test('an adapter that interpolates an unvalidated segment is rejected', async () => {
    const drifted = input();
    drifted.services = {
        ...services,
        // Same-origin and inside /api/v1, and still a path the caller never
        // named — which is why the client alone cannot catch this.
        buildPath: (template, params = {}) =>
            `/api/v1${template.replace(/\{(\w+)\}/g, (match, name) => params[name] ?? '')}`
    };
    await assert.rejects(() => validatePhase7Preview(drifted), /never issue reached a URL/);
});

test('dropping the single-transport-seam claim is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.composition.single_transport_seam = false;
    await assert.rejects(() => validatePhase7Preview(drifted), /single-transport-seam/);
});

// ── no silent caps ───────────────────────────────────────────────────────────

test('a limit with no reason is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.declared_limits.journeys_not_completable_in_this_build[0].reason = 'later';
    await assert.rejects(() => validatePhase7Preview(drifted), /no substantive reason/);
});

test('a limit that does not say what is missing is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.declared_limits.journeys_not_completable_in_this_build[0].missing = '';
    await assert.rejects(() => validatePhase7Preview(drifted), /does not say what is missing/);
});

test('a limit naming a surface the contract never froze is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.declared_limits.journeys_not_completable_in_this_build[0].surface =
        'document-editor';
    await assert.rejects(() => validatePhase7Preview(drifted), /never froze/);
});

test('every declared limit emptied out is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.declared_limits.journeys_not_completable_in_this_build = [];
    await assert.rejects(() => validatePhase7Preview(drifted), /nothing in it/);
});

test('a sync state in neither coverage list is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.declared_limits.sync_states_not_reachable = ['saving', 'offline'];
    await assert.rejects(() => validatePhase7Preview(drifted),
        /does not account for all five states/);
});

// ── the one dishonest combination ────────────────────────────────────────────

test('claiming PASS without a qualified journey is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.status = 'PASS';
    // Everything else about the deployment can be true while collaboration is
    // switched off; a journey cannot.
    await assert.rejects(() => validatePhase7Preview(drifted),
        /PASS without a journey qualified/);
});

test('claiming a journey against a deployment with collaboration off is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.preview.journeys_qualified = true;
    drifted.manifest.preview.collaboration_enabled = false;
    await assert.rejects(() => validatePhase7Preview(drifted),
        /cannot be qualified against a deployment with collaboration disabled/);
});

test('a story that is not PASS and records no owner action is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.blocked_on.owner_action = 'ask someone';
    await assert.rejects(() => validatePhase7Preview(drifted), /records no owner action/);
});

test('a blocker an agent could clear itself is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.blocked_on.agent_permitted = true;
    await assert.rejects(() => validatePhase7Preview(drifted), /is not a blocker/);
});

// ── the record and the evidence must agree ───────────────────────────────────

test('collaboration modules loading before the opener is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.preview.modules_before_opener = 1;
    await assert.rejects(() => validatePhase7Preview(drifted), /before the opener is pressed/);
});

test('a lazy measurement that measured nothing is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.preview.modules_after_opener = 0;
    await assert.rejects(() => validatePhase7Preview(drifted), /not a measurement/);
});

test('evidence that disagrees with the manifest status is rejected', async () => {
    const drifted = input();
    drifted.evidence = mutated(drifted.evidence, /^Status: PARTIAL/m, 'Status: PASS');
    await assert.rejects(() => validatePhase7Preview(drifted), /the manifest says/);
});

test('evidence for a different deployment is rejected', async () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.preview.deployment = '00000000-0000-4000-8000-000000000000';
    await assert.rejects(() => validatePhase7Preview(drifted),
        /does not name the deployment/);
});

test('the blocker and the owner action are stated at run time, not only in the manifest', () => {
    const check = read('scripts/check-cloudflare-phase-7-preview.mjs');
    assert.match(check, /OWNER ACTION REQUIRED/);
    assert.match(check, /DECLARED LIMIT/);
});
