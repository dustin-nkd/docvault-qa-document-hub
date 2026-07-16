const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const REMOTE_BINDING_KEYS = ['d1_databases', 'kv_namespaces', 'r2_buckets', 'durable_objects', 'services', 'queues', 'analytics_engine_datasets', 'hyperdrive'];

const containsKey = (value, keys) => {
    if (!value || typeof value !== 'object') return false;
    if (Object.keys(value).some(key => keys.includes(key))) return true;
    return Object.values(value).some(child => containsKey(child, keys));
};

export function validatePhase2PersistenceFoundation({ foundation, sources, apiSources, evidenceSources, wrangler }) {
    assert(foundation?.schema_version === 1 && foundation.phase === 'CF-P2'
        && foundation.story === 'CF-P2-004', 'Unsupported CF-P2-004 foundation contract');
    assert(foundation.status === 'PASS', 'CF-P2-004 is not PASS');
    assert(foundation.gate_authorization?.id === 'P2-G2'
        && foundation.gate_authorization.decision === 'APPROVED'
        && foundation.gate_authorization.approved_at === '2026-07-16'
        && foundation.gate_authorization.authorized_story === 'CF-P2-004', 'P2-G2 authorization drifted');
    assert(Object.values(foundation.environment_boundary || {}).every(value => value === false), 'CF-P2-004 must not authorize remote D1 or collaboration');
    assert(!containsKey(withoutApprovedPreviewD1(wrangler), REMOTE_BINDING_KEYS), 'Wrangler contains an unapproved remote binding');
    assert(wrangler.vars?.COLLABORATION_ENABLED === 'false'
        && wrangler.env?.preview?.vars?.COLLABORATION_ENABLED === 'false'
        && wrangler.env?.production?.vars?.COLLABORATION_ENABLED === 'false', 'Collaboration must remain disabled');

    assert(same(foundation.batch_contract?.roles, ['guard', 'domain', 'audit', 'result']), 'Guarded batch roles drifted');
    assert(foundation.batch_contract?.maximum_statements === 32
        && foundation.batch_contract?.exact_audit_statements === 1
        && foundation.batch_contract?.minimum_domain_statements === 1
        && foundation.batch_contract?.checked_changes_required === true
        && foundation.batch_contract?.exact_result_rows === 1, 'Guarded batch invariants drifted');
    assert(foundation.read_contract?.maximum_page_size === 100
        && foundation.read_contract?.explicit_row_mapping === true
        && foundation.read_contract?.client_consistency_modes_allowed === false
        && foundation.read_contract?.initial_session_constraint === 'first-primary', 'Read/session invariants drifted');

    const source = Object.values(sources).join('\n');
    for (const token of ['executeGuardedBatch', 'requireCheckedChanges', 'readBounded',
        'mapExactlyOneResult', 'captureServerBookmark', "'first-primary'"]) {
        assert(source.includes(token), `Persistence primitive is missing: ${token}`);
    }
    assert(!/SELECT\s+\*/i.test(source), 'SELECT * is prohibited in persistence sources');
    assert(!/\$\{/.test(source), 'String-built SQL is prohibited in persistence sources');
    assert(!/\bas\s+(?:any|unknown)\b|:\s*any\b/i.test(source), 'Unsafe persistence casts are prohibited');
    assert(!/first-unconstrained/.test(source), 'Authorization sessions must never use unconstrained consistency');
    assert(!/\.exec\s*\(/.test(source), 'D1 exec is prohibited in repository primitives');
    assert(!/^\s*(?:BEGIN(?:\s+TRANSACTION)?|COMMIT|ROLLBACK)\s*;/im.test(source), 'Manual transaction SQL is prohibited');
    assert(!/Math\.random|crypto\.randomUUID/.test(source), 'Persistence primitives must not create nondeterministic authority inputs');

    const apiSource = Object.values(apiSources).join('\n');
    assert(!/persistence|COLLAB_DB|D1Database/i.test(apiSource), 'Disabled API dispatcher reaches persistence');
    assert(apiSource.includes('COLLABORATION_UNAVAILABLE'), 'Disabled API response drifted');

    assert(same(foundation.evidence, ['CF-EV-P2-UT-001', 'CF-EV-P2-INT-003', 'CF-EV-P2-SEC-004']), 'CF-P2-004 evidence inventory drifted');
    assert(same(Object.keys(evidenceSources), foundation.evidence), 'CF-P2-004 evidence files drifted');
    for (const [id, evidence] of Object.entries(evidenceSources)) {
        assert(evidence.startsWith(`# ${id} `), `${id} heading is invalid`);
        assert(/^Status: PASS$/m.test(evidence), `${id} is not PASS`);
        assert(evidence.includes('CF-P2-004'), `${id} does not identify CF-P2-004`);
        assert(/local-only|No remote D1/i.test(evidence), `${id} lacks local-only evidence`);
        assert(evidence.includes('P2-G2') && evidence.includes('APPROVED'), `${id} lacks approved P2-G2 provenance`);
    }
    return true;
}
import { withoutApprovedPreviewD1 } from './cloudflare-wrangler-policy.mjs';
