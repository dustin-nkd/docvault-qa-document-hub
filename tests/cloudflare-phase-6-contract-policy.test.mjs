import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Contract } from '../scripts/cloudflare-phase-6-contract-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-6-contract-freeze.json'),
        freezeSource: read('docs/collaboration-foundation/phase-6-document-contract-freeze.md'),
        stabilityEvidence: read('docs/collaboration-foundation/evidence/phase-6/CF-EV-P6-STA-001.md'),
        securityEvidence: read('docs/collaboration-foundation/evidence/phase-6/CF-EV-P6-SEC-001.md'),
        sprintPlan: json('config/cloudflare/phase-6-sprint-plan.json'),
        migrationManifest: json('migrations/manifest.json')
    };
}

test('CF-P6-001 freezes the document, revision, and sync contract without producing runtime', () => {
    assert.equal(validatePhase6Contract(actualInput()), true);
});

test('CF-P6-001 rejects scope creep, schema, route, fingerprint, and boundary drift', () => {
    for (const mutate of [
        input => { input.manifest.status = 'PENDING'; },
        input => { input.manifest.next_gate = 'P6-G2'; },
        input => { input.manifest.authorizes_on_approval = 'CF-P6-004'; },
        // A freeze story that shipped runtime is not a freeze.
        input => { input.manifest.scope.migrations_created = 1; },
        input => { input.manifest.scope.routes_implemented = 1; },
        input => { input.manifest.scope.source_modules_implemented = 1; },
        input => { input.manifest.scope.remote_writes = 1; },
        input => { input.manifest.scope.secrets_changed = 1; },
        input => { input.manifest.scope.activation_changed = true; },
        // Schema decision.
        input => { input.manifest.schema_decision.finding = 'migration-required'; },
        input => { input.manifest.schema_decision.migration_authorized = true; },
        input => { input.manifest.schema_decision.observed_schema_version = 10; },
        input => { input.manifest.schema_decision.verification_method = 'read the schema contract'; },
        input => { input.manifest.schema_decision.monotonic_constraint = 'none'; },
        input => { input.migrationManifest.entries.push({ sequence: 13 }); },
        // Route surface, including the load-bearing eighth route.
        input => { input.manifest.route_surface.total = 7; },
        input => { input.manifest.route_surface.viewer_mutation_routes = 1; },
        input => { input.manifest.route_surface.mutations = 4; },
        input => { input.manifest.route_surface.correction.corrected_count = 7; },
        input => { input.manifest.route_surface.correction.reason = 'tidier'; },
        input => { delete input.manifest.route_surface.correction; },
        input => { input.sprintPlan.route_scope.document_routes_added = 7; },
        // Envelope and fingerprint.
        input => { input.manifest.mutation_envelope.client_override_of_server_derived = 'allowed'; },
        input => { input.manifest.mutation_envelope.server_derived = ['actorUserId']; },
        input => { input.manifest.fingerprint_contract.algorithm = 'MD5'; },
        input => { input.manifest.fingerprint_contract.ordered_inputs.reverse(); },
        input => { input.manifest.fingerprint_contract.ledger_stores = 'full-ciphertext'; },
        input => { input.manifest.fingerprint_contract.prohibited_inputs = []; },
        // Processing order: authorization must precede replay.
        input => {
            const order = input.manifest.processing_order;
            const auth = order.indexOf('authorize-membership-role-scope-state-keyversion');
            const lookup = order.indexOf('lookup-idempotency-binding');
            [order[auth], order[lookup]] = [order[lookup], order[auth]];
        },
        input => { input.manifest.processing_order = input.manifest.processing_order.slice(1); },
        input => { input.manifest.processing_order[6] = 'commit-partially'; },
        // Errors, outbox, conflict, copy.
        input => { input.manifest.error_taxonomy = input.manifest.error_taxonomy.slice(1); },
        input => { input.manifest.outbox_state_machine.expiry_behavior = 'delete'; },
        input => { input.manifest.outbox_state_machine.expiry_days = 90; },
        input => { input.manifest.outbox_state_machine.never_auto_retried = [500]; },
        input => { input.manifest.outbox_state_machine.uncertain_result_resolved_by = 'guess'; },
        input => { input.manifest.outbox_state_machine.namespace_components = ['environment']; },
        input => { input.manifest.conflict_resolution_options = ['auto-merge']; },
        input => { input.manifest.automatic_merge = true; },
        input => { input.manifest.copy_eligibility.credential_documents = 'allowed'; },
        input => { input.manifest.copy_eligibility.enforcement = 'server-enforced'; },
        input => { input.manifest.copy_eligibility.source_mutated = true; },
        // Vectors must not be claimed as implemented by the freeze story.
        input => { input.manifest.vector_contract.implemented_in_this_story = true; },
        input => { input.manifest.vector_contract.independent_oracle_required = false; },
        input => { input.manifest.vector_contract.required_agreement_percent = 95; },
        input => { input.manifest.vector_contract.sets = []; },
        // Risks and boundary.
        input => { input.manifest.residual_risks = input.manifest.residual_risks.slice(0, 2); },
        input => { input.manifest.residual_risks[0].reviewer = undefined; },
        input => { input.manifest.residual_risks[0].risk = 'none'; },
        input => { input.manifest.authorization_boundary.collaboration_activation = 'GO'; },
        input => { input.manifest.authorization_boundary.remote_changes_authorized = true; },
        input => { input.manifest.authorization_boundary.production_d1 = 'GO'; },
        // Documents and evidence.
        input => { input.freezeSource = input.freezeSource.replace(/^Status: PASS$/m, 'Status: DRAFT'); },
        input => { input.freezeSource = input.freezeSource.replace('eight routes, not seven', 'seven routes'); },
        input => { input.freezeSource = input.freezeSource.replaceAll('PersonalVaultProvider', 'AnyProvider'); },
        input => { input.stabilityEvidence = input.stabilityEvidence.replace(/^Status: PASS$/m, 'Status: PENDING'); },
        input => { input.securityEvidence = input.securityEvidence.replaceAll('CF-P6-001', 'CF-P6-002'); }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase6Contract(input), Error);
    }
});
