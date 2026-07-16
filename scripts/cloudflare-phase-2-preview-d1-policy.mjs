const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export function validatePhase2PreviewD1({ preview, manifest, wrangler, apiSources, evidenceSources }) {
    assert(preview?.schema_version === 1 && preview.phase === 'CF-P2'
        && preview.story === 'CF-P2-007' && preview.status === 'PASS', 'Unsupported CF-P2-007 contract');
    assert(preview.gate_authorization?.id === 'P2-G3'
        && preview.gate_authorization.decision === 'APPROVED'
        && preview.gate_authorization.approved_at === '2026-07-16'
        && preview.gate_authorization.authorized_story === 'CF-P2-007', 'P2-G3 authorization drifted');
    assert(preview.resource?.database_name === 'docvault-collab-preview'
        && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(preview.resource.database_id)
        && preview.resource.primary_location_hint === 'apac'
        && preview.resource.read_replication === 'disabled', 'Preview D1 resource drifted');
    assert(preview.binding?.project_name === 'docvault-qa-document-hub'
        && preview.binding.environment === 'preview'
        && preview.binding.name === 'COLLAB_DB'
        && preview.binding.configuration_authority === 'wrangler-env-preview'
        && preview.binding.production_binding_count === 0, 'Preview-only binding boundary drifted');
    assert(preview.migration?.directory === 'migrations/collaboration'
        && preview.migration.table === 'd1_migrations'
        && preview.migration.applied_count === 9
        && preview.migration.schema_version === 9
        && preview.migration.migration_set_digest === manifest.migration_set_digest
        && preview.migration.repeat_pending_count === 0
        && preview.migration.foreign_key_violations === 0, 'Remote migration evidence drifted');
    assert(manifest.entries?.length === 9 && manifest.entries.every((entry, index) => entry.sequence === index + 1), 'Migration manifest is incomplete');
    assert(preview.remote_verification?.entity_rows === 0
        && preview.remote_verification.privacy_canary_matches === 0
        && preview.remote_verification.api_business_writes === 0
        && preview.remote_verification.cli_auth === 'unavailable-failed-closed'
        && preview.remote_verification.execution_channel === 'authenticated-cloudflare-api', 'Remote verification drifted');
    assert(preview.environment_boundary?.preview_d1_created === true
        && preview.environment_boundary.preview_d1_bound === true
        && preview.environment_boundary.production_d1_bound === false
        && preview.environment_boundary.collaboration_enabled === false
        && preview.environment_boundary.real_user_data_allowed === false, 'Environment isolation drifted');
    assert(preview.p0_p1_exceptions?.length === 0, 'CF-P2-007 contains a P0/P1 exception');

    assert(wrangler.env?.preview?.d1_databases?.length === 1
        && wrangler.env.preview.d1_databases[0].binding === 'COLLAB_DB'
        && wrangler.env.preview.d1_databases[0].database_id === preview.resource.database_id
        && !wrangler.d1_databases && !wrangler.env?.production?.d1_databases, 'Wrangler preview-only D1 authority drifted');
    assert(wrangler.vars?.COLLABORATION_ENABLED === 'false'
        && wrangler.env?.preview?.vars?.COLLABORATION_ENABLED === 'false'
        && wrangler.env?.production?.vars?.COLLABORATION_ENABLED === 'false', 'Collaboration must remain disabled');
    const api = Object.values(apiSources).join('\n');
    assert(!/COLLAB_DB|D1Database|persistence/i.test(api), 'Disabled API reaches preview persistence');
    assert(api.includes('COLLABORATION_UNAVAILABLE'), 'Disabled API response drifted');
    assert(same(Object.keys(evidenceSources), preview.evidence), 'CF-P2-007 evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source), `${id} is not PASS`);
        assert(source.includes('CF-P2-007') && source.includes('P2-G3'), `${id} lacks story/gate provenance`);
        assert(!/CLOUDFLARE_API_TOKEN|account[_ -]?id|token value/i.test(source), `${id} exposes authentication material`);
    }
    return true;
}
