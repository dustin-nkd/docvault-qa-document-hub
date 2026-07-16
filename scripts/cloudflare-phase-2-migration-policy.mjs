import crypto from 'node:crypto';
import { withoutApprovedPreviewD1 } from './cloudflare-wrangler-policy.mjs';

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const normalize = source => source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const sha256 = source => crypto.createHash('sha256').update(normalize(source), 'utf8').digest('hex');
const bytes = source => Buffer.byteLength(normalize(source), 'utf8');
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const sorted = values => [...values].sort();
const sameSet = (actual, expected) => same(sorted(actual), sorted(expected));
const schemaFreezeDigest = freeze => sha256(JSON.stringify({
    identifier_profile: freeze.identifier_profile,
    tables: freeze.tables,
    migration_sequence: freeze.migration_sequence,
    prohibited_patterns: freeze.prohibited_patterns
}));

function splitDefinitions(source) {
    const definitions = [];
    let start = 0;
    let depth = 0;
    let quote = null;
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (quote) {
            if (character === quote && source[index + 1] === quote) index += 1;
            else if (character === quote) quote = null;
            continue;
        }
        if (character === "'" || character === '"') quote = character;
        else if (character === '(') depth += 1;
        else if (character === ')') depth -= 1;
        else if (character === ',' && depth === 0) {
            definitions.push(source.slice(start, index).trim());
            start = index + 1;
        }
    }
    definitions.push(source.slice(start).trim());
    return definitions;
}

export function extractTableColumns(sql) {
    const tables = {};
    const expression = /CREATE\s+TABLE\s+([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*STRICT\s*;/gi;
    for (const match of normalize(sql).matchAll(expression)) {
        const columns = splitDefinitions(match[2])
            .filter(definition => !/^(?:PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)\b/i.test(definition))
            .map(definition => definition.match(/^([a-z_][a-z0-9_]*)\b/i)?.[1])
            .filter(Boolean);
        tables[match[1]] = columns;
    }
    return tables;
}

export function validateAppliedMigrationNames(appliedNames, manifest, { requireComplete = false } = {}) {
    assert(Array.isArray(appliedNames), 'Applied migration history must be an array');
    assert(new Set(appliedNames).size === appliedNames.length, 'Applied migration history contains duplicates');
    const expected = manifest.entries.map(entry => entry.filename);
    assert(appliedNames.length <= expected.length, 'Applied migration history contains unknown entries');
    assert(same(appliedNames, expected.slice(0, appliedNames.length)), 'Applied migration history is unknown, reordered, or has a gap');
    if (requireComplete) assert(appliedNames.length === expected.length, 'Applied migration history is incomplete');
    return true;
}

export function validatePhase2Migrations({ manifest, migrationSources, freeze, wrangler }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P2' && manifest.story === 'CF-P2-002', 'Unsupported Phase 2 migration manifest');
    assert(manifest.status === 'PASS', 'CF-P2-002 migration manifest is not PASS');
    assert(manifest.migration_directory === 'migrations/collaboration', 'Migration directory drifted');
    assert(manifest.migration_table === 'd1_migrations', 'Wrangler migration table drifted');
    assert(manifest.migration_set_digest === schemaFreezeDigest(freeze), 'Migration set digest does not match the approved schema freeze');
    assert(manifest.environment_policy?.local === 'authorized-disposable-only', 'Local migration policy drifted');
    assert(manifest.environment_policy?.preview === 'prohibited-before-P2-G3', 'Preview migration policy drifted');
    assert(manifest.environment_policy?.production === 'prohibited-through-Phase-2', 'Production migration policy drifted');
    assert(!/d1_databases|database_id|preview_database_id/i.test(JSON.stringify(withoutApprovedPreviewD1(wrangler))), 'An unapproved remote D1 binding or identifier is present');
    assert(wrangler.vars?.COLLABORATION_ENABLED === 'false' && wrangler.env?.preview?.vars?.COLLABORATION_ENABLED === 'false' && wrangler.env?.production?.vars?.COLLABORATION_ENABLED === 'false', 'Collaboration must remain disabled');

    const entries = manifest.entries || [];
    assert(entries.length === 9, 'Migration manifest must contain six frozen expansions and three approved forward migrations');
    assert(sameSet(Object.keys(migrationSources), entries.map(entry => entry.filename)), 'Migration files and manifest differ');
    const frozenOwnership = new Map((freeze.migration_sequence || []).map(item => [item.sequence, item.owns]));
    const discoveredTables = {};
    let previousSha = null;
    entries.forEach((entry, index) => {
        const sequence = index + 1;
        assert(entry.sequence === sequence, `Migration sequence ${sequence} is missing or reordered`);
        const initialMigration = freeze.migration_sequence[index];
        if (initialMigration) {
            assert(entry.slug === initialMigration.slug, `Migration ${sequence} slug drifted`);
        } else if (sequence === 7) {
            assert(entry.slug === 'tenant_scope_indexes' && entry.story === 'CF-P2-003', `Forward migration ${sequence} is not authorized`);
        } else if (sequence === 8) {
            assert(entry.slug === 'transition_guards' && entry.story === 'CF-P2-005'
                && entry.gate === 'P2-G2A', `Schema correction ${sequence} is not authorized`);
        } else {
            assert(entry.slug === 'retention_purge_control' && entry.story === 'CF-P2-006'
                && entry.gate === 'P2-G2B', `Retention correction ${sequence} is not authorized`);
        }
        assert(entry.previous_sha256 === previousSha, `Migration ${sequence} hash chain drifted`);
        assert(new RegExp(`^${String(sequence).padStart(4, '0')}_[a-f0-9]{12}_${entry.slug}\\.sql$`).test(entry.filename), `Migration ${sequence} filename is invalid`);
        const source = migrationSources[entry.filename];
        const digest = sha256(source);
        assert(entry.sha256 === digest, `Migration ${entry.filename} checksum drifted`);
        assert(entry.filename.slice(5, 17) === digest.slice(0, 12), `Migration ${entry.filename} short checksum drifted`);
        assert(entry.normalized_bytes === bytes(source), `Migration ${entry.filename} byte count drifted`);
        const expectedTables = sequence === 8 ? ['transition_guards']
            : sequence === 9 ? ['retention_purge_runs'] : (frozenOwnership.get(sequence) || []);
        assert(same(entry.tables, expectedTables), `Migration ${entry.filename} table ownership drifted`);
        assert(entry.owner && entry.reviewers?.includes('Senior QA') && entry.reviewers.includes('Security Reviewer'), `Migration ${entry.filename} lacks accountable review`);
        assert(entry.requirements?.length > 0 && entry.threats?.length > 0 && entry.risks?.length > 0 && entry.validations?.length > 0, `Migration ${entry.filename} lacks traceability`);
        assert(entry.backfill === 'none' && entry.rollback_class === 'compatible-code-rollback', `Migration ${entry.filename} is not an additive compatible expansion`);
        assert(entry.privacy?.startsWith('schema-only-'), `Migration ${entry.filename} privacy classification drifted`);
        assert((source.match(/PRAGMA\s+foreign_key_check\s*;/gi) || []).length === 1, `Migration ${entry.filename} must finish with one foreign-key check`);
        assert(!/^\s*(?:BEGIN(?:\s+TRANSACTION)?|COMMIT|ROLLBACK)\s*;/im.test(source), `Migration ${entry.filename} contains an interactive transaction`);
        const destructiveContract = /\bDROP\s+(?:TABLE|COLUMN|INDEX|TRIGGER)\b|\bALTER\s+TABLE\b[\s\S]*?\b(?:DROP|RENAME)\b/i.test(source);
        const reviewedTriggerReplacement = sequence === 9
            && (source.match(/DROP\s+TRIGGER\s+(?:audit_events_no_delete|transition_guards_no_delete)\s*;/gi) || []).length === 2
            && !/\bDROP\s+(?:TABLE|COLUMN|INDEX)\b|\bALTER\s+TABLE\b[\s\S]*?\b(?:DROP|RENAME)\b/i.test(source);
        assert(!destructiveContract || reviewedTriggerReplacement, `Migration ${entry.filename} contains a destructive contract`);
        assert(!/\b(?:password|private_jwk|private_key|pkcs8|plaintext_dek|github_pat|oauth_code|session_token|invitation_token|document_title|document_body)\b/i.test(source), `Migration ${entry.filename} contains a prohibited protected field`);
        Object.assign(discoveredTables, extractTableColumns(source));
        previousSha = digest;
    });

    const frozenColumns = Object.fromEntries(freeze.tables.map(table => [table.name, table.columns]));
    frozenColumns.transition_guards = [
        'id', 'actor_user_id', 'actor_device_id', 'workspace_id', 'operation',
        'client_mutation_id', 'request_fingerprint', 'invitation_id', 'credential_digest',
        'http_status', 'result_json', 'created_at', 'expires_at', 'authority_guard'
    ];
    frozenColumns.retention_purge_runs = [
        'id', 'target', 'cutoff_at', 'started_at', 'max_rows', 'status', 'completed_at'
    ];
    assert(sameSet(Object.keys(discoveredTables), Object.keys(frozenColumns)), 'SQL table inventory differs from the schema freeze');
    for (const [table, columns] of Object.entries(frozenColumns)) assert(same(discoveredTables[table], columns), `${table} SQL columns differ from the schema freeze`);
    assert(migrationSources[entries[0].filename].includes(`X'${manifest.migration_set_digest}'`), 'schema_metadata does not bind the approved migration set digest');
    const finalSource = migrationSources[entries[5].filename];
    for (const trigger of ['document_revisions_no_update', 'document_revisions_no_delete', 'audit_events_no_update', 'audit_events_no_delete']) {
        assert(finalSource.includes(`CREATE TRIGGER ${trigger}`), `Append-only trigger is missing: ${trigger}`);
    }
    const tenantSource = migrationSources[entries[6].filename];
    for (const trigger of [
        'invitations_tenant_guard_insert', 'invitations_tenant_guard_update',
        'memberships_workspace_immutable', 'invitations_workspace_immutable',
        'workspace_key_versions_tenant_guard', 'workspace_key_versions_sequence_guard',
        'workspace_key_versions_workspace_immutable', 'workspaces_current_key_guard',
        'workspace_key_envelopes_tenant_guard', 'workspace_key_envelopes_workspace_immutable',
        'documents_tenant_guard', 'documents_workspace_immutable',
        'document_revisions_tenant_guard', 'mutation_results_tenant_guard',
        'mutation_results_workspace_immutable', 'audit_events_tenant_guard',
        'retention_holds_tenant_guard', 'retention_holds_workspace_immutable',
        'workspaces_id_immutable'
    ]) assert(tenantSource.includes(`CREATE TRIGGER ${trigger}`), `Tenant guard trigger is missing: ${trigger}`);
    const transitionSource = migrationSources[entries[7].filename];
    for (const trigger of ['transition_guards_authority_insert', 'transition_guards_no_update', 'transition_guards_no_delete']) {
        assert(transitionSource.includes(`CREATE TRIGGER ${trigger}`), `Transition guard trigger is missing: ${trigger}`);
    }
    const retentionSource = migrationSources[entries[8].filename];
    for (const control of [
        'CREATE TABLE retention_purge_runs', 'retention_purge_runs_update_guard',
        'retention_purge_runs_no_delete', 'DROP TRIGGER audit_events_no_delete',
        'DROP TRIGGER transition_guards_no_delete', 'schema_version = 9'
    ]) assert(retentionSource.includes(control), `Retention purge control is missing: ${control}`);
    validateAppliedMigrationNames([], manifest);
    validateAppliedMigrationNames(entries.map(entry => entry.filename), manifest, { requireComplete: true });
    return true;
}

export { bytes as normalizedBytes, schemaFreezeDigest, sha256 as normalizedSha256 };
