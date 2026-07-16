const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const REMOTE_KEYS = ['d1_databases', 'kv_namespaces', 'r2_buckets', 'durable_objects', 'services', 'queues'];
const containsKey = (value, keys) => value && typeof value === 'object' && (
    Object.keys(value).some(key => keys.includes(key))
    || Object.values(value).some(child => containsKey(child, keys))
);

export function validatePhase2QualityMatrix({ quality, manifest, migrationSource,
    retentionSource, schemaSource, workerSources, apiSources, evidenceSources, wrangler }) {
    assert(quality?.schema_version === 1 && quality.phase === 'CF-P2'
        && quality.story === 'CF-P2-006' && quality.status === 'PASS', 'Unsupported CF-P2-006 contract');
    assert(quality.gate_authorization?.id === 'P2-G2B'
        && quality.gate_authorization.decision === 'APPROVED'
        && quality.gate_authorization.approved_at === '2026-07-16', 'P2-G2B authorization drifted');
    assert(quality.schema_correction?.migration === '0009_16957b5a3089_retention_purge_control.sql'
        && quality.schema_correction.previous_migrations_immutable === true
        && quality.schema_correction.backfill === 'none', 'Retention correction drifted');
    assert(manifest.entries.at(-1)?.filename === quality.schema_correction.migration
        && manifest.entries.at(-1)?.gate === 'P2-G2B', 'Migration manifest lacks P2-G2B correction');
    assert(same(quality.migration_matrix, [
        'empty', 'populated', 'repeated', 'immediately-previous', 'malformed',
        'interrupted', 'restored-snapshot', 'old-runtime-new-schema',
        'disabled-new-runtime-old-schema'
    ]), 'Migration matrix is incomplete');
    assert(quality.retention_matrix.length === 9, 'Retention matrix is incomplete');
    assert(quality.retention?.operational_days === 30 && quality.retention.audit_days === 365
        && quality.retention.maximum_rows_per_type === 100
        && quality.retention.clock === 'server-owned', 'Retention baselines drifted');
    assert(quality.representative_workload?.documents === 10000
        && quality.representative_workload.revisions_per_hot_document === 50
        && quality.representative_workload.query_contracts === 13
        && quality.representative_workload.query_plan_budget_ms === 2000, 'Scale budget drifted');
    assert(quality.privacy_surfaces.length === 7 && quality.p0_p1_exceptions.length === 0
        && quality.open_regressions.length === 0, 'Privacy or severity gate is incomplete');
    assert(Object.values(quality.environment_boundary || {}).every(value => value === false), 'CF-P2-006 expanded remote authority');
    assert(!containsKey(withoutApprovedPreviewD1(wrangler), REMOTE_KEYS), 'An unapproved remote binding exists');
    assert(wrangler.vars?.COLLABORATION_ENABLED === 'false'
        && wrangler.env?.preview?.vars?.COLLABORATION_ENABLED === 'false'
        && wrangler.env?.production?.vars?.COLLABORATION_ENABLED === 'false', 'Collaboration must remain disabled');

    for (const token of [
        'CREATE TABLE retention_purge_runs', 'DROP TRIGGER audit_events_no_delete',
        'DROP TRIGGER transition_guards_no_delete', 'retention_purge_runs_update_guard',
        'retention_purge_runs_no_delete', 'schema_version = 9'
    ]) assert(migrationSource.includes(token), `Migration control is missing: ${token}`);
    const productionSource = `${retentionSource}\n${schemaSource}`;
    assert(!/SELECT\s+\*/i.test(productionSource), 'SELECT * is prohibited');
    assert(!/\$\{/.test(productionSource), 'Runtime SQL interpolation is prohibited');
    assert(!/as\s+unknown\s+as|:\s*any\b|<any>/i.test(productionSource), 'Unsafe casts are prohibited');
    for (const token of [
        'runRetentionPurge', 'maximumRowsPerType', 'THIRTY_DAYS_MS',
        'THREE_HUNDRED_SIXTY_FIVE_DAYS_MS', "status = 'active'",
        'document_revisions', 'isRuntimeSchemaCompatible'
    ]) assert(productionSource.includes(token) || Object.values(workerSources).some(source => source.includes(token)), `Quality control is missing: ${token}`);
    const workers = Object.values(workerSources).join('\n');
    for (const token of [
        '10000', '50', 'performance.now()', 'INVALID MIGRATION CHECKPOINT',
        'retention_purge_runs', 'PERSISTENCE_INTEGRITY', 'cf-p2-006-raw-session-token-canary',
        'containsPrivacyCanary'
    ]) assert(workers.includes(token), `Workers matrix evidence is missing: ${token}`);
    assert(workerSources.scale.includes('toBeLessThan(2_000)'), 'Query-plan runtime budget drifted');

    const api = Object.values(apiSources).join('\n');
    assert(!/retention_purge_runs|runRetentionPurge|COLLAB_DB/i.test(api), 'Disabled API reaches retention persistence');
    assert(api.includes('COLLABORATION_UNAVAILABLE'), 'Disabled API contract drifted');
    assert(same(Object.keys(evidenceSources), quality.evidence), 'CF-P2-006 evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source), `${id} is not PASS`);
        assert(source.includes('CF-P2-006') && source.includes('P2-G2B'), `${id} lacks story/gate provenance`);
        assert(/local-only|No remote D1/i.test(source), `${id} lacks local-only evidence`);
    }
    return true;
}
import { withoutApprovedPreviewD1 } from './cloudflare-wrangler-policy.mjs';
