import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Conflict } from '../scripts/cloudflare-phase-6-conflict-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-6');
const IDS = ['CF-EV-P6-E2E-002', 'CF-EV-P6-QA-003', 'CF-EV-P6-SEC-007', 'CF-EV-P6-UX-001'];

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-6-conflict-copy.json'),
        moduleSource: read('js/collaboration/conflict-resolution.js'),
        nodeTestSource: read('tests/conflict-resolution.test.mjs'),
        workersTestSource: read('tests/cloudflare/conflict-resolution.workers.test.ts'),
        browserTestSource: read('tests/browser-conflict-resolution.mjs'),
        contractFreeze: json('config/cloudflare/phase-6-contract-freeze.json'),
        packageJson: json('package.json'),
        evidenceSources: Object.fromEntries(IDS
            .map(id => [id, fs.readFileSync(path.join(evidenceDirectory, `${id}.md`), 'utf8')]))
    };
}

test('CF-P6-007 delivers explicit conflict resolution and a manual unlinked copy', () => {
    assert.equal(validatePhase6Conflict(actualInput()), true);
});

test('CF-P6-007 rejects merge, silent-discard, credential, and accessibility drift', () => {
    for (const mutate of [
        input => { input.manifest.status = 'PENDING'; },
        input => { input.manifest.next_gate = 'P6-G4'; },
        input => { input.manifest.authorizes_on_approval = 'CF-P6-009'; },
        // Resolution inventory and the merge prohibition.
        input => { input.manifest.conflict.options = ['auto-merge']; },
        input => { input.contractFreeze.conflict_resolution_options = ['review-latest']; },
        input => { input.manifest.conflict.automatic_merge = true; },
        input => { input.manifest.conflict.merge_function_throws = false; },
        input => { input.contractFreeze.automatic_merge = true; },
        input => { input.moduleSource = input.moduleSource.replaceAll('AUTOMATIC_MERGE_PROHIBITED', 'OK'); },
        // Silent draft loss is the failure this story exists to prevent.
        input => { input.manifest.conflict.options_that_drop_the_draft = ['reapply-to-latest', 'discard-with-confirmation']; },
        input => { input.manifest.conflict.draft_retained_on_open = false; },
        input => { input.manifest.conflict.discard_requires_confirmation = false; },
        input => { input.moduleSource = input.moduleSource.replaceAll('CONFIRMATION_REQUIRED', 'OK'); },
        input => { input.nodeTestSource = input.nodeTestSource.replaceAll('no resolution other than a confirmed discard drops the draft', 'x'); },
        input => { input.manifest.conflict.double_resolution_rejected = false; },
        input => { input.manifest.conflict.reapply_rebases_to_current_revision = false; },
        input => { input.manifest.conflict.separate_copy_revision = 2; },
        input => { input.moduleSource = input.moduleSource.replaceAll('CONFLICT_ALREADY_RESOLVED', 'OK'); },
        // Accessibility.
        input => { input.manifest.accessibility.status_conveyed_by_colour_alone = true; },
        input => { input.manifest.accessibility.every_state_has_shape_token = false; },
        input => { input.manifest.accessibility.verified_in_browsers = false; },
        input => { input.moduleSource = input.moduleSource.replaceAll('shape:', 'colour:'); },
        // Copy contract.
        input => { input.manifest.copy.credential_selectable = true; },
        input => { input.manifest.copy.credential_rejected_before_encryption = false; },
        input => { input.manifest.copy.enforcement = 'server-enforced'; },
        input => { input.contractFreeze.copy_eligibility.enforcement = 'server-enforced'; },
        input => { input.manifest.copy.residual_risk_restated = false; },
        input => { input.manifest.copy.source_mutated = true; },
        input => { input.manifest.copy.linked = true; },
        input => { input.manifest.copy.destination_revision = 2; },
        input => { input.manifest.copy.requires_destination_role = ['owner', 'admin', 'editor', 'viewer']; },
        input => { input.manifest.copy.requires_classification_confirmation = false; },
        input => { input.manifest.copy.idempotent_replay = false; },
        input => { input.moduleSource = input.moduleSource.replaceAll('CREDENTIAL_NOT_COPYABLE', 'OK'); },
        // Revision outcomes must be proven against D1.
        input => { input.manifest.revision_outcomes_verified_against_d1 = []; },
        input => { input.manifest.revision_outcomes_verified_against_d1[0].outcome = 'fine'; },
        input => { input.workersTestSource = input.workersTestSource.replaceAll('executeDocumentMutation', 'fake'); },
        input => { input.workersTestSource = input.workersTestSource.replaceAll('save-as-separate-copy', 'x'); },
        // Browser evidence.
        input => { input.manifest.browser_matrix = ['chromium']; },
        input => { input.manifest.browser_evidence.all_options_reachable = false; },
        input => { input.manifest.browser_evidence.only_confirmed_discard_drops_draft = false; },
        input => { input.manifest.browser_evidence.console_errors = 1; },
        input => { input.manifest.browser_evidence.registered_in_e2e = false; },
        input => { input.browserTestSource = input.browserTestSource.replaceAll('CREDENTIAL_NOT_COPYABLE', 'x'); },
        input => { input.packageJson.scripts['test:e2e'] = 'node tests/browser-smoke.mjs'; },
        // Tests, evidence, boundary.
        input => { input.manifest.tests.skips = 1; },
        input => { input.manifest.tests.browser_engines = 2; },
        input => { delete input.evidenceSources['CF-EV-P6-UX-001']; },
        input => { input.evidenceSources['CF-EV-P6-SEC-007'] = '# CF-EV-P6-SEC-007 x\n\nStatus: PENDING\n\nCF-P6-007\n'; },
        input => { input.manifest.authorization_boundary.routes_registered = 1; },
        input => { input.manifest.authorization_boundary.personal_vault_diff_lines = 1; },
        input => { input.manifest.authorization_boundary.collaboration_activation = 'GO'; }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase6Conflict(input), Error);
    }
});
