const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export const FINGERPRINT_INPUTS = Object.freeze(['actorUserId', 'actorDeviceId', 'workspaceId',
    'operation', 'documentId', 'baseRevisionOrCreateSentinel', 'keyVersion', 'envelopeVersion',
    'ciphertextDigest', 'ciphertextBytes']);

export const ERROR_CODES = Object.freeze(['VALIDATION_FAILED', 'RESOURCE_NOT_FOUND',
    'DOCUMENT_REVISION_CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_WINDOW_EXPIRED',
    'KEY_VERSION_MISMATCH']);

export const RESOLUTION_OPTIONS = Object.freeze(['review-latest', 'reapply-to-latest',
    'save-as-separate-copy', 'discard-with-confirmation']);

const sorted = values => [...values].sort();
const sameSet = (actual, expected) => JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));

export function validatePhase6Contract({ manifest, freezeSource, stabilityEvidence,
    securityEvidence, sprintPlan, migrationManifest }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P6'
        && manifest.story === 'CF-P6-001' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P6-G0' && manifest.next_gate === 'P6-G1'
        && manifest.authorizes_on_approval === 'CF-P6-002', 'Unsupported Phase 6 contract manifest');

    // A contract-freeze story that produced runtime is not a contract freeze.
    const scope = manifest.scope || {};
    for (const key of ['migrations_created', 'routes_implemented', 'source_modules_implemented',
        'bindings_changed', 'secrets_changed', 'remote_writes']) {
        assert(scope[key] === 0, `CF-P6-001 exceeded its freeze scope: ${key}`);
    }
    assert(scope.activation_changed === false, 'CF-P6-001 changed activation');

    const schema = manifest.schema_decision || {};
    assert(schema.finding === 'schema-12-sufficient-no-migration'
        && schema.migration_authorized === false
        && schema.observed_schema_version === 12 && schema.observed_migration_count === 12
        && schema.verification_method === 'read-only query of live isolated Preview D1'
        && schema.append_only_constraint === 'PRIMARY KEY (document_id, revision)'
        && schema.monotonic_constraint === 'CHECK (base_revision = revision - 1)'
        && typeof schema.revision_idempotency_constraint === 'string'
        && typeof schema.ledger_idempotency_constraint === 'string',
    'Phase 6 schema decision drifted');
    assert(migrationManifest.entries?.length === 12,
        'Phase 6 contract freeze implies a migration beyond sequence 12');

    // The eighth route is load-bearing for the outbox; record why it exists so a
    // later "simplification" cannot quietly drop it again.
    const routes = manifest.route_surface || {};
    assert(routes.total === 8 && routes.mutations === 3 && routes.reads === 5
        && routes.viewer_mutation_routes === 0, 'Phase 6 route surface drifted');
    assert(routes.correction?.initial_plan_count === 7 && routes.correction.corrected_count === 8
        && routes.correction.added_route === 'GET /api/v1/workspaces/{workspaceId}/mutations/{clientMutationId}'
        && typeof routes.correction.reason === 'string'
        && routes.correction.reason.includes('lost a mutation response'),
    'Phase 6 route correction record drifted');
    assert(sprintPlan.route_scope?.document_routes_added === routes.total
        && sprintPlan.route_scope.routes?.length === routes.total,
    'Contract freeze and sprint plan disagree on the route surface');

    const envelope = manifest.mutation_envelope || {};
    assert(envelope.client_override_of_server_derived === 'prohibited'
        && sameSet(envelope.server_derived || [],
            ['actorUserId', 'effectiveRole', 'authoritativeTime', 'revision'])
        && (envelope.client_fields || []).includes('clientMutationId'),
    'Mutation envelope drifted');

    const fingerprint = manifest.fingerprint_contract || {};
    assert(fingerprint.algorithm === 'SHA-256'
        && JSON.stringify(fingerprint.ordered_inputs) === JSON.stringify(FINGERPRINT_INPUTS)
        && fingerprint.ledger_stores === 'digest-only'
        && sameSet(fingerprint.prohibited_inputs || [],
            ['plaintext', 'draft-context', 'full-ciphertext']),
    'Fingerprint contract drifted');

    assert(Array.isArray(manifest.processing_order) && manifest.processing_order.length === 7
        && manifest.processing_order[0] === 'authenticate-session-and-device'
        && manifest.processing_order[1] === 'authorize-membership-role-scope-state-keyversion'
        && manifest.processing_order[3] === 'lookup-idempotency-binding'
        && manifest.processing_order[6] === 'commit-once-or-leave-unchanged',
    'Atomic processing order drifted');
    // Authorization must precede the idempotency lookup, or a revoked actor could
    // replay a previously successful mutation.
    assert(manifest.processing_order.indexOf('authorize-membership-role-scope-state-keyversion')
        < manifest.processing_order.indexOf('lookup-idempotency-binding'),
    'Authorization no longer precedes idempotency replay');

    assert(sameSet((manifest.error_taxonomy || []).map(entry => entry.code), ERROR_CODES)
        && (manifest.error_taxonomy || []).every(entry => Number.isInteger(entry.status)),
    'Error taxonomy drifted');

    const outbox = manifest.outbox_state_machine || {};
    assert(outbox.expiry_behavior === 'quarantine-not-delete' && outbox.expiry_days === 7
        && outbox.max_pending_entries === 100 && outbox.max_bytes === 26_214_400
        && outbox.uncertain_result_resolved_by
            === 'GET /api/v1/workspaces/{workspaceId}/mutations/{clientMutationId}'
        && sameSet(outbox.namespace_components || [],
            ['environment', 'provider_subject', 'workspace_id', 'device_id', 'document_id'])
        && [401, 403, 409].every(status => (outbox.never_auto_retried || []).includes(status)),
    'Outbox state machine drifted');

    assert(sameSet(manifest.conflict_resolution_options || [], RESOLUTION_OPTIONS)
        && manifest.automatic_merge === false, 'Conflict resolution contract drifted');

    const copy = manifest.copy_eligibility || {};
    assert(copy.mode === 'manual-one-time-unlinked'
        && copy.credential_documents === 'rejected-before-destination-encryption'
        && copy.enforcement === 'client-side-only'
        && copy.destination_revision === 1 && copy.source_mutated === false,
    'Copy eligibility drifted');

    const vectors = manifest.vector_contract || {};
    assert(vectors.independent_oracle_required === true
        && vectors.required_agreement_percent === 100
        && vectors.implemented_by_story === 'CF-P6-003'
        && vectors.implemented_in_this_story === false
        && sameSet((vectors.sets || []).map(set => set.id),
            ['CF-VEC-P6-ENV-001', 'CF-VEC-P6-FPR-001']),
    'Vector contract drifted');

    assert(Array.isArray(manifest.residual_risks) && manifest.residual_risks.length >= 5
        && manifest.residual_risks.every(risk => risk.owner && risk.reviewer && risk.disposition),
    'A Phase 6 residual risk lacks an owner, reviewer, or disposition');
    assert(manifest.residual_risks.some(risk => /Credential rejection is client-side only/.test(risk.risk)),
        'The Credential-rejection residual risk is missing');

    const boundary = manifest.authorization_boundary || {};
    assert(boundary.collaboration_activation === 'NO-GO' && boundary.production_identity === 'NO-GO'
        && boundary.production_d1 === 'NO-GO' && boundary.production_document_routes === 'NO-GO'
        && boundary.remote_changes_authorized === false, 'Phase 6 authorization boundary drifted');

    assert(/^Status: PASS$/m.test(freezeSource)
        && freezeSource.includes('schema-12-sufficient-no-migration')
        && freezeSource.includes('eight routes, not seven')
        && freezeSource.includes('PersonalVaultProvider')
        && freezeSource.includes('authorizes **`CF-P6-002` only**'),
    'Phase 6 contract freeze document drifted');
    for (const source of [stabilityEvidence, securityEvidence]) {
        assert(/^Status: PASS$/m.test(source) && source.includes('CF-P6-001'),
            'Phase 6 contract evidence is not PASS for CF-P6-001');
    }
    return true;
}
