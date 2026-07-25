const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export const OUTBOX_STATES = Object.freeze(['queued', 'inflight', 'applied', 'terminal',
    'expired', 'quarantined']);

export const QUARANTINE_REASONS = Object.freeze(['logout', 'account-change', 'workspace-change',
    'role-removed', 'device-revoked', 'membership-lost', 'key-rotated', 'schema-unsupported',
    'lifecycle-incompatible', 'expired']);

const sorted = values => [...values].sort();
const sameSet = (actual, expected) => JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));

export function validatePhase6Outbox({ manifest, outboxSource, nodeTestSource, replayTestSource,
    browserTestSource, packageJson, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P6'
        && manifest.story === 'CF-P6-006' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P6-G2C' && manifest.next_gate === 'P6-G3'
        && manifest.authorizes_on_approval === 'CF-P6-007', 'Unsupported Phase 6 outbox manifest');
    assert(sameSet(manifest.states || [], OUTBOX_STATES), 'Outbox state machine drifted');

    // Plaintext must be structurally impossible to persist, not merely discouraged.
    const storage = manifest.storage || {};
    assert(storage.payload_accepts_only_bytes === true && storage.draft_accepts_only_bytes === true
        && storage.plaintext_fields === 0 && storage.same_state_machine_both === true
        && sameSet(storage.namespace_components || [],
            ['environment', 'provider_subject', 'workspace_id', 'device_id']),
    'Outbox storage contract drifted');
    assert(/INVALID_PAYLOAD/.test(outboxSource) && /INVALID_DRAFT/.test(outboxSource)
        && /instanceof Uint8Array/.test(outboxSource), 'Byte-only payload enforcement removed');

    // A retry without the original mutation id would create duplicate revisions.
    const retry = manifest.retry || {};
    assert(retry.reuses_original_mutation_id === true
        && retry.backoff === 'exponential-full-jitter'
        && retry.ceiling_ms === 300_000 && Number.isInteger(retry.max_attempts)
        && retry.max_attempts >= 1 && retry.max_attempts <= 20, 'Retry policy drifted');
    for (const status of [401, 403, 409, 404]) {
        assert((retry.non_retryable_statuses || []).includes(status),
            `Status ${status} must never auto-retry`);
    }
    for (const code of ['KEY_VERSION_MISMATCH', 'VALIDATION_FAILED', 'DOCUMENT_REVISION_CONFLICT',
        'RESOURCE_NOT_FOUND']) {
        assert((retry.non_retryable_codes || []).includes(code), `Code ${code} must never auto-retry`);
    }
    assert(/clientMutationId/.test(outboxSource) && /MAX_BACKOFF_MS/.test(outboxSource),
        'Retry controls missing from the module');

    const ordering = manifest.ordering || {};
    assert(ordering.per_document_fifo === true && ordering.declared_predecessor === true
        && ordering.independent_documents_concurrent === true
        && ordering.inflight_blocks_same_document === true, 'Ordering contract drifted');
    assert(/predecessorId/.test(outboxSource), 'Predecessor ordering removed');

    const quota = manifest.quota || {};
    assert(quota.max_pending_entries === 100 && quota.max_bytes === 26_214_400
        && quota.warn_at_percent === 80 && quota.refusal_preserves_queued_work === true
        && quota.byte_ceiling_enforced_independently === true, 'Quota contract drifted');

    // Nothing may be silently destroyed.
    const expiry = manifest.expiry || {};
    assert(expiry.days === 7 && expiry.behavior === 'quarantine-not-delete'
        && expiry.draft_preserved === true, 'Expiry contract drifted');
    assert(sameSet(manifest.quarantine_reasons || [], QUARANTINE_REASONS),
        'Quarantine reason inventory drifted');

    const authority = manifest.authority || {};
    assert(authority.queued_entry_is_permission === false
        && authority.reauthorized_on_submission === true
        && authority.quarantined_entry_claimable === false
        && authority.reauthentication_alone_restores === false, 'Queued-authority contract drifted');

    const disposal = manifest.disposal || {};
    assert(disposal.requires_recorded_result === true && disposal.silent_delete === false
        && disposal.forensic_erasure_claimed === false, 'Disposal contract drifted');
    assert(/RESULT_NOT_RECORDED/.test(outboxSource), 'Disposal guard removed');

    const scenarios = manifest.sprint_gate_scenarios_addressed || [];
    assert(scenarios.length === 1 && scenarios[0].id === 'G6'
        && typeof scenarios[0].proof === 'string' && scenarios[0].proof.length > 60,
    'Sprint gate G6 coverage drifted');
    assert(/G6:/.test(replayTestSource), 'Replay test lost G6 coverage');
    // G6 is only meaningful if it is proven against real storage.
    assert(/executeDocumentMutation/.test(replayTestSource)
        && /COLLAB_DB/.test(replayTestSource), 'G6 is no longer proven against real D1');
    assert(/replayed/.test(replayTestSource), 'The lost-response replay case disappeared');

    // A defect found by the suite must be recorded as fixed, never accepted.
    const defect = manifest.defect_found_and_fixed || {};
    assert(typeof defect.defect === 'string' && defect.accepted_as_known_issue === false
        && typeof defect.resolution === 'string', 'Defect record drifted');

    const browser = manifest.browser_evidence || {};
    assert(sameSet(manifest.browser_matrix || [], ['chromium', 'firefox', 'webkit'])
        && browser.real_indexeddb === true && browser.bytes_survive_round_trip === true
        && browser.survives_page_reload === true && browser.namespace_isolated_in_browser === true
        && browser.quarantine_verified_in_browser === true && browser.console_errors === 0
        && browser.registered_in_e2e === true, 'Browser evidence drifted');
    assert(/indexedDB/.test(browserTestSource) && /page\.reload/.test(browserTestSource),
        'Browser test no longer exercises real IndexedDB across a reload');
    assert(/test:outbox:e2e/.test(packageJson.scripts?.['test:e2e'] ?? ''),
        'The browser outbox test is not wired into the e2e gate');

    assert(/namespaces are isolated/.test(nodeTestSource), 'Namespace isolation coverage removed');
    assert(manifest.tests?.skips === 0 && manifest.tests.result === 'PASS'
        && manifest.tests.browser_engines === 3, 'Test inventory drifted');

    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P6-006'), `${id} is not PASS evidence for CF-P6-006`);
    }
    assert(sameSet(Object.keys(evidenceSources),
        ['CF-EV-P6-UT-005', 'CF-EV-P6-INT-003', 'CF-EV-P6-E2E-001', 'CF-EV-P6-SEC-006']),
    'Outbox evidence inventory drifted');

    const boundary = manifest.authorization_boundary || {};
    assert(boundary.routes_registered === 0 && boundary.migrations_created === 0
        && boundary.remote_writes === 0 && boundary.personal_vault_diff_lines === 0
        && boundary.collaboration_activation === 'NO-GO',
    'Phase 6 outbox authorization boundary drifted');
    return true;
}
