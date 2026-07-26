import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase5Exit } from '../scripts/cloudflare-phase-5-exit-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-5');
    return {
        manifest: json('config/cloudflare/phase-5-exit-gate.json'),
        evidenceSources: Object.fromEntries(fs.readdirSync(evidenceDirectory).filter(name => /^CF-EV-P5-.*\.md$/.test(name))
            .map(name => [name.replace(/\.md$/, ''), fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')])),
        storyContracts: {
            'CF-P5-001': json('config/cloudflare/phase-5-contract-freeze.json'),
            'CF-P5-002': json('config/cloudflare/phase-5-crypto-primitives.json'),
            'CF-P5-003': json('config/cloudflare/phase-5-device-key-lifecycle.json'),
            'CF-P5-004': json('config/cloudflare/phase-5-device-services.json'),
            'CF-P5-005': json('config/cloudflare/phase-5-workspace-keys.json'),
            'CF-P5-006': json('config/cloudflare/phase-5-rotation-recovery.json'),
            'CF-P5-007': json('config/cloudflare/phase-5-preview-key-foundation.json')
        },
        migrationManifest: json('migrations/manifest.json'),
        wrangler: json('wrangler.jsonc'),
        riskRegister: read('docs/collaboration-foundation/risk-register.md'),
        exitReport: read('docs/collaboration-foundation/phase-5-exit-report.md'),
        handoff: read('docs/collaboration-foundation/phase-6-handoff.md'),
        sprintSource: read('docs/collaboration-foundation/phase-5-sprint.md'),
        asOf: new Date('2026-07-25T00:00:00Z')
    };
}

// NO-OP CONTROL. The unmutated, real repository input must pass. This is the
// load-bearing precondition for every assert.throws below: if the real input
// already threw, a no-op mutation would throw identically and the whole drift
// suite would be vacuous — green while proving nothing. Do not weaken this.
test('CF-P5-008 reconciles Phase 5 evidence, schema, remote boundary, recovery, and Phase 6 handoff', () => {
    assert.doesNotThrow(() => validatePhase5Exit(actualInput()));
    assert.equal(validatePhase5Exit(actualInput()), true);
});

test('CF-P5-008 rejects activation, evidence loss, unretired authority, and schema drift', () => {
    for (const mutate of [
        input => { input.manifest.status = 'PENDING'; },
        input => { input.manifest.gate_authorization.id = 'P5-G4A'; },
        input => { input.manifest.gate_authorization.decision = 'PENDING'; },
        input => { input.manifest.decision.collaboration_activation = 'GO'; },
        input => { input.manifest.decision.production_identity = 'GO'; },
        input => { input.manifest.decision.phase_6_encrypted_documents = 'GO'; },
        input => { input.manifest.review_due = '2026-07-24'; },
        input => { input.manifest.stories = input.manifest.stories.slice(1); },
        input => { input.manifest.stories[0].status = 'IN PROGRESS'; },
        input => { input.manifest.stories[7].evidence = ['CF-EV-P5-QA-004']; },
        input => { delete input.evidenceSources['CF-EV-P5-STA-002']; },
        input => { input.evidenceSources['CF-EV-P5-OPS-003'] = '# CF-EV-P5-OPS-003 x\n\nStatus: PENDING\n\nCF-P5-008\n'; },
        input => { input.manifest.quality.evidence_record_count = 30; },
        input => { input.storyContracts['CF-P5-006'] = { story: 'CF-P5-006', status: 'PENDING' }; },
        input => { input.manifest.schema_inventory.schema_version = 10; },
        input => { input.manifest.schema_inventory.migration_set_digest = 'f'.repeat(64); },
        input => { input.manifest.schema_inventory.pending_remote_migrations = 1; },
        input => { input.manifest.schema_inventory.destructive_or_down_migrations = 1; },
        input => { input.manifest.remote_boundary.preview_active_authority.sessions = 1; },
        input => { input.manifest.remote_boundary.preview_active_authority.unrevoked_key_envelopes = 1; },
        input => { input.manifest.remote_boundary.preview_phase_6_rows.documents = 1; },
        input => { input.manifest.remote_boundary.preview_foreign_key_violations = 1; },
        input => { input.manifest.remote_boundary.production_d1_bindings = 1; },
        input => { input.manifest.remote_boundary.collaboration_enabled = 'true'; },
        input => { input.manifest.remote_boundary.production_disabled_shell_status = 200; },
        input => { input.manifest.remote_boundary.github_pages_api_status = 200; },
        input => { input.manifest.remote_boundary.preview_unauthenticated_key_read_status = 200; },
        input => { input.manifest.remote_boundary.preview_hostile_origin_mutation_status = 204; },
        input => { input.manifest.remote_boundary.preview_retained_history.workspace_key_envelopes = 0; },
        input => { input.manifest.recovery.shared_preview_restore_executed = true; },
        input => { input.manifest.recovery.physical_deletes = 1; },
        input => { input.manifest.recovery.disposable_rehearsal_result = 'SKIPPED'; },
        input => { input.manifest.recovery.post_reconciliation_bookmark_sha256
            = input.manifest.recovery.pre_reconciliation_bookmark_sha256; },
        input => { input.manifest.verified_deployments.cloudflare_preview_qualification_deployment_id = 'not-a-uuid'; },
        input => { input.manifest.verified_deployments.verified_baseline_commit = 'abc'; },
        input => { input.manifest.quality.accepted_flakiness = ['CF-P4-007 latency budget']; },
        input => { input.manifest.quality.open_p0_p1_defects = ['x']; },
        input => { input.manifest.quality.plaintext_key_material_findings = ['x']; },
        input => { input.manifest.quality.unowned_or_expired_critical_high_risks = ['R09']; },
        input => { input.manifest.quality.dependency_vulnerabilities = 1; },
        input => { input.manifest.quality.preview_remote_read_p95_ms = 400; },
        input => { input.manifest.quality.resolved_during_exit_verification = ['CF-P4-007 flake accepted as known.']; },
        input => { input.manifest.known_limitations = ['too short']; },
        input => { input.manifest.sign_off.independent_reviewers_exist = true; },
        input => { input.manifest.sign_off.independent_security_or_privacy_review_performed = true; },
        input => { input.manifest.sign_off.roles_covered = ['Product Owner']; },
        input => { input.manifest.sign_off.model = 'seven-independent-reviews'; },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        // D-P7-01 (approved 2026-07-26) activates collaboration on PREVIEW only,
        // so mutating preview to 'true' is now a no-op. Retargeted onto the two
        // scopes the decision leaves switched off forever — production and the
        // top-level vars default — so the activation proof survives the decision.
        input => { input.wrangler.env.production.vars.COLLABORATION_ENABLED = 'true'; },
        input => { input.wrangler.vars.COLLABORATION_ENABLED = 'true'; },
        input => { input.riskRegister = input.riskRegister.replace(/^\| R09 \|.*$/m, '| R09 | x | Open |'); },
        input => { input.exitReport = input.exitReport.replace(/^Status: PASS$/m, 'Status: DRAFT'); },
        input => { input.exitReport = input.exitReport.replace('single-maintainer project', 'reviewed project'); },
        input => { input.exitReport = input.exitReport.replaceAll('Privacy Reviewer', 'Reviewer'); },
        input => { input.handoff = input.handoff.replace(/^Status: \*\*CONTROLLING.*$/m, 'Status: **DRAFT**'); },
        input => { input.sprintSource = input.sprintSource.replace(/^Status: .*$/m, 'Status: **DONE**'); }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase5Exit(input), Error);
    }
});

// The loop above matches on bare `Error`, which cannot show WHICH assertion
// fired. The activation boundary is the one thing D-P7-01 narrows, so pin it
// here by message: preview is authorized to be 'true', nothing else is, and
// preview may not be silently switched back off either.
test('CF-P5-008 confines the D-P7-01 activation to preview and pins production and the vars default off', () => {
    const noOp = actualInput();
    assert.equal(noOp.wrangler.env.preview.vars.COLLABORATION_ENABLED, 'true');
    assert.equal(noOp.wrangler.env.production.vars.COLLABORATION_ENABLED, 'false');
    assert.equal(noOp.wrangler.vars.COLLABORATION_ENABLED, 'false');
    assert.equal(validatePhase5Exit(noOp), true);

    for (const mutate of [
        input => { input.wrangler.env.production.vars.COLLABORATION_ENABLED = 'true'; },
        input => { input.wrangler.vars.COLLABORATION_ENABLED = 'true'; }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase5Exit(input), /Production or activation boundary drifted outside preview/);
    }

    const disarmed = actualInput();
    disarmed.wrangler.env.preview.vars.COLLABORATION_ENABLED = 'false';
    assert.throws(() => validatePhase5Exit(disarmed), /Preview no longer carries the D-P7-01 authorization/);
});
