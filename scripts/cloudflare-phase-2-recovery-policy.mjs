const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const isSha256 = value => /^[0-9a-f]{64}$/.test(value || '');
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export function validatePhase2Recovery({ recovery, preview, wrangler, apiSources, evidenceSources }) {
    assert(recovery?.schema_version === 1 && recovery.phase === 'CF-P2'
        && recovery.story === 'CF-P2-008' && recovery.status === 'PASS', 'Unsupported CF-P2-008 contract');
    assert(recovery.gate_authorization?.id === 'P2-G4'
        && recovery.gate_authorization.decision === 'APPROVED'
        && recovery.gate_authorization.authorized_story === 'CF-P2-008', 'P2-G4 authorization drifted');
    assert(recovery.shared_preview?.database_name === preview.resource?.database_name
        && isSha256(recovery.shared_preview.bookmark_sha256)
        && recovery.shared_preview.bookmark_access === 'read-only'
        && recovery.shared_preview.restore_attempts === 0
        && recovery.shared_preview.schema_version === 9
        && recovery.shared_preview.entity_rows_after_rehearsal === 0, 'Shared preview isolation drifted');
    assert(recovery.recovery_resource?.database_name === 'docvault-collab-recovery-p2-008'
        && recovery.recovery_resource.location === 'APAC'
        && recovery.recovery_resource.read_replication === 'disabled'
        && recovery.recovery_resource.synthetic_data_only === true
        && recovery.recovery_resource.deleted === true
        && recovery.recovery_resource.remaining_name_matches === 0
        && recovery.recovery_resource.binding_count === 0, 'Disposable recovery cleanup drifted');
    assert(recovery.recovery?.schema_version === 9 && recovery.recovery.migration_count === 9
        && isSha256(recovery.recovery.baseline_bookmark_sha256)
        && isSha256(recovery.recovery.undo_bookmark_sha256)
        && recovery.recovery.restore_duration_ms > 0
        && recovery.recovery.restore_duration_ms < 60_000
        && recovery.recovery.recovery_gap.length > 0
        && recovery.recovery.abort_condition.includes('collaboration disabled')
        && recovery.recovery.undo_strategy.includes('disposable database')
        && recovery.recovery.export_import_required === false
        && recovery.recovery.schema_downgrade_attempts === 0
        && recovery.recovery.foreign_key_violations === 0, 'Recovery execution evidence drifted');
    assert(Object.entries(recovery.restored_invariants || {})
        .filter(([key]) => !key.endsWith('_rows')).every(([, value]) => value === true)
        && recovery.restored_invariants.mutated_revision_rows === 0
        && recovery.restored_invariants.mutated_audit_rows === 0, 'Restored invariants drifted');
    assert(recovery.runtime_compatibility?.feature_disablement_precedes_rollback === true
        && /^[0-9a-f]{7}$/.test(recovery.runtime_compatibility.current_commit)
        && /^[0-9a-f]{7}$/.test(recovery.runtime_compatibility.previous_commit)
        && recovery.runtime_compatibility.current_disabled_api_status === 503
        && recovery.runtime_compatibility.previous_disabled_api_status === 503
        && recovery.runtime_compatibility.disabled_api_cache_control === 'no-store, private'
        && recovery.runtime_compatibility.cloudflare_guest_status === 200
        && recovery.runtime_compatibility.github_pages_guest_status === 200
        && recovery.runtime_compatibility.schema_downgrade_required === false, 'Runtime rollback compatibility drifted');
    assert(recovery.environment_boundary?.production_restore_attempts === 0
        && recovery.environment_boundary.production_d1_bound === false
        && recovery.environment_boundary.shared_preview_restore_attempts === 0
        && recovery.environment_boundary.collaboration_enabled === false
        && recovery.environment_boundary.personal_vault_unchanged === true, 'Environment boundary drifted');
    assert(!wrangler.d1_databases && !wrangler.env?.production?.d1_databases
        && wrangler.env?.preview?.d1_databases?.length === 1
        && wrangler.env.preview.d1_databases[0].database_id === preview.resource.database_id, 'Recovery resource leaked into Wrangler bindings');
    assert(wrangler.vars?.COLLABORATION_ENABLED === 'false'
        && wrangler.env?.preview?.vars?.COLLABORATION_ENABLED === 'false'
        && wrangler.env?.production?.vars?.COLLABORATION_ENABLED === 'false', 'Collaboration must remain disabled');
    assert(!/COLLAB_DB|D1Database|persistence/i.test(Object.values(apiSources).join('\n')), 'Disabled API reaches persistence');
    assert(recovery.p0_p1_exceptions?.length === 0, 'CF-P2-008 contains a P0/P1 exception');
    assert(same(Object.keys(evidenceSources), recovery.evidence), 'CF-P2-008 evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source), `${id} is not PASS`);
        assert(source.includes('CF-P2-008') && source.includes('P2-G4'), `${id} lacks story/gate provenance`);
        assert(!/CLOUDFLARE_API_TOKEN|account[_ -]?id|token value|0000000[0-9]-[0-9a-f-]{20,}/i.test(source), `${id} exposes secret or raw bookmark material`);
    }
    return true;
}
