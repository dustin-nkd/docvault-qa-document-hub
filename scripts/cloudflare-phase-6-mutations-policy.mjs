const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export const ERROR_TAXONOMY = Object.freeze(['VALIDATION_FAILED', 'RESOURCE_NOT_FOUND',
    'DOCUMENT_REVISION_CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_WINDOW_EXPIRED',
    'KEY_VERSION_MISMATCH']);

export const DENIAL_MATRIX = Object.freeze(['viewer', 'removed-member', 'revoked-device',
    'cross-workspace-identifier', 'non-current-key-version', 'tombstoned-target',
    'revoked-after-success-replay']);

const sorted = values => [...values].sort();
const sameSet = (actual, expected) => JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));

export function validatePhase6Mutations({ manifest, serviceSource, recipeSource, registrySource,
    integrationTestSource, contractFreeze, migrationManifest, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P6'
        && manifest.story === 'CF-P6-004' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P6-G2A' && manifest.next_gate === 'P6-G2B'
        && manifest.authorizes_on_approval === 'CF-P6-005', 'Unsupported Phase 6 mutation manifest');

    // The sprint carries no migration authority; adding audit event types must
    // stay a code change, never a schema change.
    assert(manifest.migration_required === false && migrationManifest.entries?.length === 12,
        'Phase 6 mutations imply a migration');
    assert(sameSet(manifest.recipes_added || [], ['document.create', 'document.tombstone'])
        && sameSet(manifest.audit_events_added || [], ['document.created', 'document.tombstoned']),
    'Document recipe or audit inventory drifted');
    for (const operation of ['document.create', 'document.update', 'document.tombstone']) {
        assert(recipeSource.includes(`'${operation}'`), `Recipe missing: ${operation}`);
    }
    for (const event of ['document.created', 'document.updated', 'document.tombstoned']) {
        assert(registrySource.includes(`'${event}'`), `Audit event missing: ${event}`);
    }

    // Atomicity is the whole story: a denial or a stale precondition must not be
    // able to leave a partial write.
    const atomicity = manifest.atomicity || {};
    assert(atomicity.guard_carries_authorization === true
        && atomicity.guard_carries_precondition === true
        && atomicity.rollback_on_guard_failure === true
        && atomicity.bare_writes_outside_batch === 0
        && sameSet(atomicity.statement_roles || [], ['guard', 'domain', 'audit', 'result']),
    'Atomic boundary drifted');

    const authorization = manifest.authorization || {};
    assert(sameSet(authorization.roles_permitted || [], ['owner', 'admin', 'editor'])
        && authorization.viewer_permitted === false
        && authorization.checked_before_apply === true
        && authorization.checked_before_replay === true
        && authorization.client_override_possible === false
        && sameSet(authorization.server_derived_fields || [],
            ['actorUserId', 'effectiveRole', 'authoritativeTime', 'revision']),
    'Document authorization contract drifted');
    // A Viewer must be excluded inside the SQL guard, not in application code that
    // a later refactor could bypass.
    for (const guardControl of ["role IN ('owner', 'admin', 'editor')", "state = 'active'"]) {
        assert(recipeSource.includes(guardControl), `Guard control missing: ${guardControl}`);
    }

    const idempotency = manifest.idempotency || {};
    assert(idempotency.ledger === 'mutation_results'
        && idempotency.fingerprint_bytes === 32
        && idempotency.fingerprint_comparison === 'constant-time'
        && idempotency.retention_days === 30
        && idempotency.replay_returns_original === true
        && idempotency.replay_creates_second_revision === false
        && idempotency.replay_creates_second_audit_event === false
        && idempotency.different_fingerprint_error === 'IDEMPOTENCY_KEY_REUSED'
        && idempotency.expired_window_error === 'IDEMPOTENCY_WINDOW_EXPIRED'
        && sameSet(idempotency.binding || [], ['actor_user_id', 'actor_device_id', 'workspace_id',
            'operation', 'client_mutation_id']), 'Idempotency contract drifted');

    const revisions = manifest.revisions || {};
    assert(revisions.append_only === true && revisions.monotonic === true
        && revisions.create_revision === 1 && revisions.delete_is_tombstone === true
        && revisions.rows_deleted === 0, 'Revision contract drifted');

    assert(sameSet(manifest.error_taxonomy || [], ERROR_TAXONOMY), 'Error taxonomy drifted');
    assert(sameSet(contractFreeze.error_taxonomy?.map(entry => entry.code) || [], ERROR_TAXONOMY),
        'Implementation and CF-P6-001 freeze disagree on the error taxonomy');
    assert(sameSet(manifest.conflict_disclosure || [], ['submittedBaseRevision', 'currentRevision']),
        'Conflict response discloses more than the two revisions');

    // The three gate scenarios this story is responsible for.
    const scenarios = manifest.sprint_gate_scenarios_addressed || [];
    assert(sameSet(scenarios.map(entry => entry.id), ['G3', 'G4', 'G5'])
        && scenarios.every(entry => typeof entry.proof === 'string' && entry.proof.length > 30
            && typeof entry.evidence === 'string'), 'Sprint gate coverage drifted');
    assert(sameSet(manifest.denial_matrix || [], DENIAL_MATRIX), 'Denial matrix drifted');
    for (const marker of ['G3:', 'G4:', 'G5:']) {
        assert(integrationTestSource.includes(marker), `Integration test lost gate coverage: ${marker}`);
    }
    // Row counts, not response codes, are what make these gates meaningful.
    assert(/SELECT COUNT\(\*\) AS n FROM document_revisions/.test(integrationTestSource)
        && /SELECT COUNT\(\*\) AS n FROM audit_events/.test(integrationTestSource),
    'Integration tests no longer inspect D1 side effects');

    const failure = manifest.failure_injection || {};
    assert(failure.business_tables_changed === 0 && failure.document_pointer_changed === false
        && typeof failure.boundary === 'string', 'Failure-injection evidence drifted');

    const privacy = manifest.privacy || {};
    assert(privacy.server_visible_plaintext === false && privacy.audit_metadata === '{}'
        && sameSet(privacy.ledger_result_keys || [],
            ['clientMutationId', 'documentId', 'occurredAt', 'operation', 'revision']),
    'Privacy posture drifted');
    assert(!/plaintext|draftContext/i.test(serviceSource.replace(/\/\/.*$/gm, '')),
        'The document service references plaintext');
    for (const control of ['executeIdempotentRecipe', 'DOCUMENT_ERRORS', 'classifyGuardFailure']) {
        assert(serviceSource.includes(control), `Service control missing: ${control}`);
    }

    // A Phase 2 assertion was adjusted; the record must stay honest that no
    // security property was relaxed and that safety coverage widened.
    const adjustment = manifest.phase_2_assertion_adjustment || {};
    assert(adjustment.security_property_relaxed === false
        && /widened/.test(adjustment.safety_loop_coverage || ''), 'Phase 2 adjustment record drifted');

    assert(manifest.tests?.workers_total >= 218 && manifest.tests.skips === 0
        && manifest.tests.result === 'PASS', 'Test inventory drifted');

    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P6-004'), `${id} is not PASS evidence for CF-P6-004`);
    }
    assert(sameSet(Object.keys(evidenceSources),
        ['CF-EV-P6-UT-003', 'CF-EV-P6-INT-001', 'CF-EV-P6-SEC-004', 'CF-EV-P6-QA-002']),
    'Mutation evidence inventory drifted');

    const boundary = manifest.authorization_boundary || {};
    assert(boundary.routes_implemented === 0 && boundary.migrations_created === 0
        && boundary.remote_writes === 0 && boundary.personal_vault_diff_lines === 0
        && boundary.collaboration_activation === 'NO-GO',
    'Phase 6 mutation authorization boundary drifted');
    return true;
}
