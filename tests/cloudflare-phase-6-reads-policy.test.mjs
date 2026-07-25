import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Reads } from '../scripts/cloudflare-phase-6-reads-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-6');
const IDS = ['CF-EV-P6-UT-004', 'CF-EV-P6-INT-002', 'CF-EV-P6-SEC-005'];

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-6-document-reads.json'),
        readsSource: read('functions/_lib/documents/document-reads.ts'),
        integrationTestSource: read('tests/cloudflare/document-reads.workers.test.ts'),
        evidenceSources: Object.fromEntries(IDS
            .map(id => [id, fs.readFileSync(path.join(evidenceDirectory, `${id}.md`), 'utf8')]))
    };
}

test('CF-P6-005 delivers authorized reads with bound cursors and no-store responses', () => {
    assert.equal(validatePhase6Reads(actualInput()), true);
});

test('CF-P6-005 rejects scoping, disclosure, cursor, caching, and honesty drift', () => {
    for (const mutate of [
        input => { input.manifest.status = 'PENDING'; },
        input => { input.manifest.next_gate = 'P6-G3'; },
        input => { input.manifest.authorizes_on_approval = 'CF-P6-008'; },
        input => { input.manifest.operations = ['readDocument']; },
        input => { input.readsSource = input.readsSource.replace('export async function readRevision', 'async function readRevision'); },
        // Reader authorization.
        input => { input.manifest.authorization.requires_active_device = false; },
        input => { input.manifest.authorization.requires_active_workspace = false; },
        input => { input.manifest.authorization.viewer_can_read = false; },
        input => { input.manifest.authorization.role_constrained = true; },
        input => { input.manifest.authorization.rationale = 'because'; },
        input => { input.readsSource = input.readsSource.replaceAll("d.state = 'active'", "d.state IS NOT NULL"); },
        input => { input.readsSource = input.readsSource.replaceAll("u.status = 'active'", "1 = 1"); },
        // Workspace scoping is the tenant boundary.
        input => { input.manifest.scoping.workspace_scoped_in_sql = false; },
        input => { input.manifest.scoping.filtered_after_fetch = true; },
        input => { input.readsSource = input.readsSource.replaceAll('workspace_id = ?', 'workspace_id IS NOT NULL'); },
        // Non-disclosure.
        input => { input.manifest.non_disclosure.shared_denial_code = 'DOCUMENT_NOT_FOUND'; },
        input => { input.manifest.non_disclosure.existence_oracle_possible = true; },
        input => { input.manifest.non_disclosure.causes_mapped_to_shared_code = ['non-member']; },
        input => { input.readsSource += "\nconst code = 'WORKSPACE_NOT_FOUND';\n"; },
        // Cursor.
        input => { input.manifest.pagination.cursor = 'plain-offset'; },
        input => { input.manifest.pagination.cursor_bindings = ['position']; },
        input => { input.manifest.pagination.forgeable = true; },
        input => { input.manifest.pagination.transferable_across_workspaces = true; },
        input => { input.manifest.pagination.transferable_across_routes = true; },
        input => { input.manifest.pagination.maximum_page_size = 100000; },
        input => { input.manifest.pagination.cursor_ttl_ms = 86_400_000; },
        input => { input.readsSource = input.readsSource.replaceAll('hmacVerify', 'alwaysTrue'); },
        input => { input.readsSource = input.readsSource.replace('payload.workspaceId !== expected.workspaceId', 'false'); },
        input => { input.readsSource = input.readsSource.replace('payload.route !== expected.route', 'false'); },
        input => { input.readsSource = input.readsSource.replace('payload.documentId !== expected.documentId', 'false'); },
        // Tombstone semantics.
        input => { input.manifest.tombstone_semantics.current_read_returns_metadata_only = false; },
        input => { input.manifest.tombstone_semantics.tombstone_revision_serves_payload = true; },
        input => { input.manifest.tombstone_semantics.earlier_revisions_readable = false; },
        // Caching.
        input => { input.manifest.response_headers.cache_control = 'public, max-age=60'; },
        input => { input.manifest.response_headers.service_worker = 'all'; },
        input => { input.manifest.response_headers.content_type_options = 'none'; },
        input => { input.readsSource = input.readsSource.replace('no-store, private', 'public'); },
        input => { input.readsSource = input.readsSource.replace('Service-Worker-Allowed', 'X-Ignored'); },
        // Gate coverage.
        input => { input.manifest.sprint_gate_scenarios_addressed = []; },
        input => { input.manifest.sprint_gate_scenarios_addressed[0].proof = 'ok'; },
        input => { input.manifest.sprint_gate_scenarios_addressed[0].id = 'G9'; },
        input => { input.integrationTestSource = input.integrationTestSource.replaceAll('G2:', 'x:'); },
        input => { input.integrationTestSource = input.integrationTestSource.replaceAll('otherWorkspaceCursor', 'skipped'); },
        input => { input.integrationTestSource = input.integrationTestSource.replaceAll('foreignCodec', 'skipped'); },
        // Honesty about deployment status.
        input => { input.manifest.route_registration.registered_in_deployed_preview_runtime = true; },
        input => { input.manifest.route_registration.registration_story = 'CF-P6-005'; },
        input => { input.manifest.route_registration.reason = 'done'; },
        // Tests, evidence, boundary.
        input => { input.manifest.tests.skips = 2; },
        input => { input.manifest.tests.result = 'FAIL'; },
        input => { delete input.evidenceSources['CF-EV-P6-SEC-005']; },
        input => { input.evidenceSources['CF-EV-P6-UT-004'] = '# CF-EV-P6-UT-004 x\n\nStatus: PENDING\n\nCF-P6-005\n'; },
        input => { input.manifest.authorization_boundary.routes_registered = 4; },
        input => { input.manifest.authorization_boundary.personal_vault_diff_lines = 1; },
        input => { input.manifest.authorization_boundary.collaboration_activation = 'GO'; }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase6Reads(input), Error);
    }
});
