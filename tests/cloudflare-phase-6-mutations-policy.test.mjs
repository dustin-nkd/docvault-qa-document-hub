import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Mutations } from '../scripts/cloudflare-phase-6-mutations-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-6');
const IDS = ['CF-EV-P6-UT-003', 'CF-EV-P6-INT-001', 'CF-EV-P6-SEC-004', 'CF-EV-P6-QA-002'];

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-6-document-mutations.json'),
        serviceSource: read('functions/_lib/documents/document-service.ts'),
        recipeSource: read('functions/_lib/persistence/mutation-recipes.ts'),
        registrySource: read('functions/_lib/audit/event-registry.ts'),
        integrationTestSource: read('tests/cloudflare/document-mutations.workers.test.ts'),
        contractFreeze: json('config/cloudflare/phase-6-contract-freeze.json'),
        migrationManifest: json('migrations/manifest.json'),
        evidenceSources: Object.fromEntries(IDS
            .map(id => [id, fs.readFileSync(path.join(evidenceDirectory, `${id}.md`), 'utf8')]))
    };
}

test('CF-P6-004 delivers atomic mutations, append-only revisions, and idempotency', () => {
    assert.equal(validatePhase6Mutations(actualInput()), true);
});

test('CF-P6-004 rejects atomicity, authorization, idempotency, and boundary drift', () => {
    for (const mutate of [
        input => { input.manifest.status = 'PENDING'; },
        input => { input.manifest.next_gate = 'P6-G3'; },
        input => { input.manifest.authorizes_on_approval = 'CF-P6-008'; },
        // Migration authority.
        input => { input.manifest.migration_required = true; },
        input => { input.migrationManifest.entries.push({ sequence: 13 }); },
        input => { input.manifest.recipes_added = ['document.create']; },
        input => { input.manifest.audit_events_added = []; },
        input => { input.recipeSource = input.recipeSource.replaceAll("'document.tombstone'", "'document.purge'"); },
        input => { input.registrySource = input.registrySource.replaceAll("'document.created'", "'doc.new'"); },
        // Atomicity.
        input => { input.manifest.atomicity.guard_carries_authorization = false; },
        input => { input.manifest.atomicity.guard_carries_precondition = false; },
        input => { input.manifest.atomicity.rollback_on_guard_failure = false; },
        input => { input.manifest.atomicity.bare_writes_outside_batch = 1; },
        input => { input.manifest.atomicity.statement_roles = ['domain']; },
        // Authorization — Viewer exclusion must live in SQL.
        input => { input.manifest.authorization.viewer_permitted = true; },
        input => { input.manifest.authorization.roles_permitted = ['owner', 'admin', 'editor', 'viewer']; },
        input => { input.manifest.authorization.checked_before_replay = false; },
        input => { input.manifest.authorization.client_override_possible = true; },
        input => { input.manifest.authorization.server_derived_fields = ['actorUserId']; },
        input => { input.recipeSource = input.recipeSource.replaceAll("role IN ('owner', 'admin', 'editor')", "role IS NOT NULL"); },
        // Idempotency.
        input => { input.manifest.idempotency.replay_creates_second_revision = true; },
        input => { input.manifest.idempotency.replay_creates_second_audit_event = true; },
        input => { input.manifest.idempotency.fingerprint_comparison = 'naive'; },
        input => { input.manifest.idempotency.retention_days = 3650; },
        input => { input.manifest.idempotency.binding = ['client_mutation_id']; },
        input => { input.manifest.idempotency.different_fingerprint_error = 'OK'; },
        // Revisions.
        input => { input.manifest.revisions.append_only = false; },
        input => { input.manifest.revisions.delete_is_tombstone = false; },
        input => { input.manifest.revisions.rows_deleted = 1; },
        input => { input.manifest.revisions.create_revision = 0; },
        // Errors and disclosure.
        input => { input.manifest.error_taxonomy = ['VALIDATION_FAILED']; },
        input => { input.contractFreeze.error_taxonomy = [{ code: 'OTHER', status: 400 }]; },
        input => { input.manifest.conflict_disclosure = ['currentRevision', 'ciphertext']; },
        // Gate coverage must stay proven by row counts.
        input => { input.manifest.sprint_gate_scenarios_addressed = []; },
        input => { input.manifest.sprint_gate_scenarios_addressed[0].proof = 'works'; },
        input => { input.manifest.denial_matrix = ['viewer']; },
        input => { input.integrationTestSource = input.integrationTestSource.replaceAll('G4:', 'x:'); },
        input => { input.integrationTestSource = input.integrationTestSource.replaceAll('SELECT COUNT(*) AS n FROM audit_events', 'SELECT 1'); },
        // Failure injection and privacy.
        input => { input.manifest.failure_injection.business_tables_changed = 1; },
        input => { input.manifest.failure_injection.document_pointer_changed = true; },
        input => { input.manifest.privacy.server_visible_plaintext = true; },
        input => { input.manifest.privacy.audit_metadata = '{"title":"x"}'; },
        input => { input.manifest.privacy.ledger_result_keys = ['documentId', 'title']; },
        input => { input.serviceSource += '\nconst plaintext = 1;\n'; },
        input => { input.serviceSource = input.serviceSource.replaceAll('executeIdempotentRecipe', 'rawWrite'); },
        // Phase 2 adjustment honesty.
        input => { input.manifest.phase_2_assertion_adjustment.security_property_relaxed = true; },
        input => { input.manifest.phase_2_assertion_adjustment.safety_loop_coverage = 'narrowed to 3'; },
        // Tests, evidence, boundary.
        input => { input.manifest.tests.skips = 1; },
        input => { input.manifest.tests.result = 'FAIL'; },
        input => { delete input.evidenceSources['CF-EV-P6-SEC-004']; },
        input => { input.evidenceSources['CF-EV-P6-QA-002'] = '# CF-EV-P6-QA-002 x\n\nStatus: PENDING\n\nCF-P6-004\n'; },
        input => { input.manifest.authorization_boundary.routes_implemented = 1; },
        input => { input.manifest.authorization_boundary.personal_vault_diff_lines = 3; },
        input => { input.manifest.authorization_boundary.collaboration_activation = 'GO'; }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase6Mutations(input), Error);
    }
});
