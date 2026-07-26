const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const ROUTES = Object.freeze(['document-list', 'document-create', 'document-read',
    'document-update', 'document-tombstone', 'revision-list', 'revision-read',
    'mutation-reconcile']);

export const SCENARIOS = Object.freeze(['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);

export function validatePhase6Preview({ manifest, routeSource, evidence }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P6'
        && manifest.story === 'CF-P6-008' && manifest.remote_gate === 'P6-G4',
    'Unsupported Phase 6 Preview qualification manifest');
    assert(manifest.environment === 'preview', 'CF-P6-008 may only qualify against Preview');

    // The eight frozen routes must all be registered and all be claimed.
    assert(same(manifest.routes || [], ROUTES), 'The Phase 6 route inventory drifted');
    for (const route of ROUTES) {
        assert(routeSource.includes(`id: '${route}'`),
            `Route is claimed but not registered: ${route}`);
    }

    // Every sprint gate scenario must be described, not merely listed.
    const scenarios = manifest.gate_scenarios_over_http || {};
    assert(same(Object.keys(scenarios), SCENARIOS), 'A sprint gate scenario is unaccounted for');
    for (const id of SCENARIOS) {
        assert(typeof scenarios[id] === 'string' && scenarios[id].length > 30,
            `Scenario ${id} has no substantive result recorded`);
    }

    // A Viewer denial only counts if nothing was written.
    const denial = manifest.viewer_denial || {};
    assert(same(denial.denied_operations || [],
        ['document-create', 'document-update', 'document-tombstone']),
    'The Viewer denial set is incomplete');
    assert(denial.non_disclosing === true && typeof denial.shared_denial_code === 'string',
        'The Viewer denial must use one shared non-disclosing code');
    assert(denial.rows_written === 0 && denial.revisions_before === denial.revisions_after,
        'A denied Viewer write changed persisted state');

    // Qualification must never be reached by weakening the deployed surface.
    assert(manifest.test_bypass_deployed === false, 'A test bypass was deployed to Preview');
    assert(manifest.encryption?.server_saw_plaintext === false,
        'The server was exposed to document plaintext');
    assert(manifest.encryption?.viewer_unwrapped_workspace_key === true,
        'The Viewer read was not proven against a real workspace key');
    assert(manifest.identities?.count >= 2,
        'G2 and G3 require two distinct identities');
    assert(manifest.identities?.synthetic === false
        && typeof manifest.identities.provenance === 'string',
    'Identity provenance drifted');

    // Residual Preview state may be carried, but never misreported.
    const cleanup = manifest.cleanup || {};
    const remaining = (cleanup.sessions_active ?? 0) + (cleanup.devices_active ?? 0)
        + (cleanup.workspaces_active ?? 0) + (cleanup.documents_active ?? 0);
    assert(cleanup.complete === (remaining === 0), 'Cleanup completeness is misreported');
    assert(cleanup.documents_active === 0, 'An active test document remains in Preview');
    assert(remaining === 0 || (typeof cleanup.residual_reason === 'string'
        && cleanup.residual_reason.length > 40),
    'Residual Preview state carries no explanation');

    assert(manifest.status === 'PASS', 'CF-P6-008 is not PASS');
    assert(/^Status: PASS$/m.test(evidence), 'CF-EV-P6-QA-004 is not PASS');
    return true;
}
