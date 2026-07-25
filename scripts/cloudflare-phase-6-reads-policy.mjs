const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export const READ_OPERATIONS = Object.freeze(['listDocuments', 'readDocument',
    'listRevisions', 'readRevision']);

export const CURSOR_BINDINGS = Object.freeze(['route', 'workspaceId', 'documentId',
    'position', 'issuedAt', 'expiresAt']);

const sorted = values => [...values].sort();
const sameSet = (actual, expected) => JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));

export function validatePhase6Reads({ manifest, readsSource, integrationTestSource, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P6'
        && manifest.story === 'CF-P6-005' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P6-G2B' && manifest.next_gate === 'P6-G2C'
        && manifest.authorizes_on_approval === 'CF-P6-006', 'Unsupported Phase 6 reads manifest');
    assert(sameSet(manifest.operations || [], READ_OPERATIONS), 'Read operation inventory drifted');
    for (const operation of READ_OPERATIONS) {
        assert(new RegExp(`export async function ${operation}`).test(readsSource),
            `Read operation missing: ${operation}`);
    }

    // Reads are open to Viewers on purpose. The manifest must say so explicitly
    // rather than leaving a future reader to wonder whether it was an oversight.
    const authorization = manifest.authorization || {};
    assert(authorization.requires_active_membership === true
        && authorization.requires_active_device === true
        && authorization.requires_active_user === true
        && authorization.requires_active_workspace === true
        && authorization.role_constrained === false
        && authorization.viewer_can_read === true
        && typeof authorization.rationale === 'string'
        && /Viewer/.test(authorization.rationale), 'Read authorization contract drifted');
    for (const control of ["m.state = 'active'", "d.state = 'active'", "u.status = 'active'",
        "w.state = 'active'"]) {
        assert(readsSource.includes(control), `Reader guard control missing: ${control}`);
    }

    assert(manifest.scoping?.workspace_scoped_in_sql === true
        && manifest.scoping.filtered_after_fetch === false, 'Workspace scoping drifted');
    // Every read query must carry the workspace in its WHERE clause.
    const queries = readsSource.match(/FROM document[s_]*[\s\S]*?(?=\.bind|`\))/g) || [];
    assert(queries.length >= 3 && queries.every(query => /workspace_id = \?/.test(query)),
        'A read query lost its workspace scope');

    const disclosure = manifest.non_disclosure || {};
    assert(disclosure.shared_denial_code === 'RESOURCE_NOT_FOUND'
        && disclosure.existence_oracle_possible === false
        && (disclosure.causes_mapped_to_shared_code || []).length >= 8,
    'Non-disclosure contract drifted');
    assert(!/DOCUMENT_NOT_FOUND|WORKSPACE_NOT_FOUND|FORBIDDEN/.test(readsSource),
        'A distinguishable denial code was introduced');

    const pagination = manifest.pagination || {};
    assert(pagination.cursor === 'hmac-sha256-opaque'
        && sameSet(pagination.cursor_bindings || [], CURSOR_BINDINGS)
        && pagination.cursor_ttl_ms === 900_000
        && pagination.default_page_size === 25 && pagination.maximum_page_size === 100
        && pagination.forgeable === false
        && pagination.transferable_across_workspaces === false
        && pagination.transferable_across_routes === false
        && pagination.transferable_across_documents === false, 'Pagination contract drifted');
    for (const control of ['hmacSign', 'hmacVerify', 'expiresAt', 'payload.workspaceId !== expected.workspaceId',
        'payload.route !== expected.route', 'payload.documentId !== expected.documentId']) {
        assert(readsSource.includes(control), `Cursor control missing: ${control}`);
    }

    const tombstone = manifest.tombstone_semantics || {};
    assert(tombstone.current_read_returns_metadata_only === true
        && tombstone.current_read_payload === null
        && tombstone.tombstone_revision_serves_payload === false
        && tombstone.earlier_revisions_readable === true, 'Tombstone read semantics drifted');

    // A cached ciphertext page would outlive the authorization that produced it.
    const headers = manifest.response_headers || {};
    assert(headers.cache_control === 'no-store, private' && headers.pragma === 'no-cache'
        && headers.expires === '0' && headers.service_worker === 'none'
        && headers.content_type_options === 'nosniff'
        && headers.referrer_policy === 'no-referrer', 'Read response headers drifted');
    for (const header of ['no-store, private', 'Service-Worker-Allowed', 'no-referrer', 'nosniff']) {
        assert(readsSource.includes(header), `Response header missing: ${header}`);
    }

    const scenarios = manifest.sprint_gate_scenarios_addressed || [];
    assert(scenarios.length === 1 && scenarios[0].id === 'G2'
        && typeof scenarios[0].proof === 'string' && scenarios[0].proof.length > 30,
    'Sprint gate G2 coverage drifted');
    assert(/G2:/.test(integrationTestSource), 'Integration test lost G2 coverage');
    for (const control of ['not-a-cursor', 'foreignCodec', 'otherWorkspaceCursor', 'wrongRoute',
        'cursorTtlMilliseconds']) {
        assert(integrationTestSource.includes(control), `Cursor negative coverage missing: ${control}`);
    }

    // Registration status must stay honest: the routes are not deployed yet.
    const registration = manifest.route_registration || {};
    assert(registration.registered_in_deployed_preview_runtime === false
        && registration.registration_story === 'CF-P6-008'
        && typeof registration.reason === 'string' && /route inventory/.test(registration.reason),
    'Route registration status must stay honest');

    assert(manifest.tests?.workers_total >= 228 && manifest.tests.skips === 0
        && manifest.tests.result === 'PASS', 'Test inventory drifted');

    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P6-005'), `${id} is not PASS evidence for CF-P6-005`);
    }
    assert(sameSet(Object.keys(evidenceSources),
        ['CF-EV-P6-UT-004', 'CF-EV-P6-INT-002', 'CF-EV-P6-SEC-005']), 'Read evidence inventory drifted');

    const boundary = manifest.authorization_boundary || {};
    assert(boundary.routes_registered === 0 && boundary.migrations_created === 0
        && boundary.remote_writes === 0 && boundary.personal_vault_diff_lines === 0
        && boundary.collaboration_activation === 'NO-GO',
    'Phase 6 read authorization boundary drifted');
    return true;
}
