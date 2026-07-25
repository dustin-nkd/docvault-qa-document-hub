import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6SprintPlan } from '../scripts/cloudflare-phase-6-sprint-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-6-sprint-plan.json'),
        sprintSource: read('docs/collaboration-foundation/phase-6-sprint.md'),
        handoff: read('docs/collaboration-foundation/phase-6-handoff.md'),
        apiContract: read('docs/collaboration-foundation/api-contract.md'),
        migrationManifest: json('migrations/manifest.json'),
        wrangler: json('wrangler.jsonc')
    };
}

test('CF-P6-S01 plans the shared document slice within the approved boundary', () => {
    assert.equal(validatePhase6SprintPlan(actualInput()), true);
});

test('CF-P6-S01 rejects scope, migration, route, provider, and conflict drift', () => {
    for (const mutate of [
        input => { input.manifest.status = 'ACTIVE'; },
        input => { input.manifest.authorization.decision = 'APPROVED'; },
        input => { input.manifest.authorization.remote_changes_authorized = true; },
        input => { input.manifest.authorization.authorized_story_on_approval = 'CF-P6-004'; },
        input => { input.manifest.entry.predecessor_status = 'PENDING'; },
        // Sprint approval must never become migration authority.
        input => { input.manifest.schema_decision.migration_authorized_by_sprint_approval = true; },
        input => { input.manifest.schema_decision.finding = 'migration-required'; },
        input => { input.manifest.schema_decision.required_tables_present = ['documents']; },
        input => { input.migrationManifest.entries.push({ sequence: 13 }); },
        // Provider isolation is the whole point of "personal documents unchanged".
        input => { input.manifest.providers.automatic_personal_upload = 'allowed'; },
        input => { input.manifest.providers.personal_fallback_on_collaboration_failure = 'allowed'; },
        input => { input.manifest.providers.names = ['PersonalGitHubProvider', 'CollaborationProvider']; },
        input => { input.manifest.providers.guest_uses_provider = true; },
        // Route surface and Viewer write prohibition.
        input => { input.manifest.route_scope.document_routes_added = 8; },
        input => { input.manifest.route_scope.viewer_mutation_routes = 1; },
        input => { input.manifest.route_scope.other_routes_added = 1; },
        input => { input.manifest.route_scope.routes.pop(); },
        input => { input.manifest.route_scope.routes[0].path = '/api/v1/workspaces/{workspaceId}/export'; },
        input => { input.manifest.route_scope.routes[0].idempotency = true; },
        input => { input.manifest.route_scope.routes[1].idempotency = false; },
        input => { input.apiContract = input.apiContract.replaceAll('/tombstone', '/purge'); },
        // Boundaries.
        input => { input.manifest.boundaries.collaboration_activation = 'GO'; },
        input => { input.manifest.boundaries.production_d1 = 'present'; },
        input => { input.manifest.boundaries.server_visible_plaintext = 'allowed'; },
        input => { input.manifest.boundaries.automatic_merge = 'allowed'; },
        input => { input.manifest.boundaries.client_timestamp_conflict_resolution = 'allowed'; },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { input.wrangler.env.preview.vars.COLLABORATION_ENABLED = 'true'; },
        // Conflict and idempotency semantics.
        input => { input.manifest.conflict_contract.stale_base_status = 200; },
        input => { input.manifest.conflict_contract.automatic_merge = true; },
        input => { input.manifest.conflict_contract.authority = 'client timestamp'; },
        input => { input.manifest.conflict_contract.idempotency_retention_days = 3650; },
        input => { input.manifest.conflict_contract.resolution_options = ['auto-merge']; },
        // Outbox.
        input => { input.manifest.outbox_contract.storage = 'plaintext-localstorage'; },
        input => { input.manifest.outbox_contract.expiry_behavior = 'delete'; },
        input => { input.manifest.outbox_contract.non_retryable_statuses = [500]; },
        input => { input.manifest.outbox_contract.reauthorized_on_submission = false; },
        input => { input.manifest.outbox_contract.max_pending_entries = 100000; },
        // Copy to workspace.
        input => { input.manifest.copy_to_workspace.credential_documents = 'allowed'; },
        input => { input.manifest.copy_to_workspace.source_mutated = true; },
        input => { input.manifest.copy_to_workspace.mode = 'automatic-sync'; },
        input => { input.manifest.copy_to_workspace.residual_risk = 'none'; },
        // Stories, gates, scenarios, budgets.
        input => { input.manifest.stories = input.manifest.stories.slice(1); },
        input => { input.manifest.stories[0].status = 'PASS'; },
        input => { input.manifest.stories[0].evidence = []; },
        input => { input.manifest.stories[1].evidence = input.manifest.stories[0].evidence; },
        input => { input.manifest.stories[0].exit_gate = 'P7-G1'; },
        input => { input.manifest.gate_sequence = ['P6-G0']; },
        input => { input.manifest.sprint_gate_scenarios.pop(); },
        input => { input.manifest.quality_budgets.personal_provider_writes_allowed = 1; },
        input => { input.manifest.quality_budgets.preview_authenticated_write_p95_ms = 5000; },
        input => { input.manifest.quality_budgets.eager_phase_6_modules_on_personal_startup = 3; },
        input => { input.manifest.quality_budgets.zero_tolerance = ['open_defect']; },
        input => { input.manifest.recovery_contract.shared_preview_restore = 'allowed'; },
        input => { input.manifest.recovery_contract.rehearsals_required = ['one']; },
        input => { input.manifest.exit_gate_requirement.automated_check = 'none'; },
        // Documents.
        input => { input.sprintSource = input.sprintSource.replace(/^Status: .*$/m, 'Status: **APPROVED**'); },
        input => { input.sprintSource = input.sprintSource.replace('### `CF-P6-007`', '### `CF-P6-107`'); },
        input => { input.sprintSource = input.sprintSource.replaceAll('PersonalVaultProvider', 'AnyProvider'); },
        input => { input.sprintSource = input.sprintSource.replace('APPROVE `CF-P6-001` ONLY', 'APPROVE ALL STORIES'); },
        input => { input.handoff = input.handoff.replace(/^Status: \*\*CONTROLLING.*$/m, 'Status: **DRAFT**'); }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase6SprintPlan(input), Error);
    }
});
