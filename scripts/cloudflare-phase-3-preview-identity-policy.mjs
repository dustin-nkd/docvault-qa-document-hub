const assert = (condition, message) => { if (!condition) throw new Error(message); };
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export const PREVIEW_IDENTITY_EVIDENCE = ['CF-EV-P3-OPS-002', 'CF-EV-P3-SEC-008'];

export function validatePhase3PreviewIdentityPolicy({ manifest, sprint, wrangler, burstWrangler,
    runtimeSource, workerSource, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P3'
        && manifest.story === 'CF-P3-008' && manifest.status === 'PASS', 'Unsupported Preview identity evidence');
    assert(manifest.authorization?.gate === 'P3-G4B' && manifest.authorization.decision === 'APPROVED'
        && manifest.authorization.next_gate === 'P3-G4A' && manifest.authorization.next_story === 'CF-P3-009',
    'Preview authorization drifted');
    assert(sprint.authorization?.gate === 'P3-G4B' && sprint.authorization.authorized_story === 'CF-P3-008'
        && sprint.stories?.find(story => story.id === 'CF-P3-008')?.status === 'PASS', 'Sprint disposition drifted');

    const preview = manifest.preview || {};
    assert(preview.runtime_mode === 'preview-only' && preview.d1_binding === 'COLLAB_DB'
        && preview.service_binding === 'AUTH_BURST_SERVICE'
        && preview.private_worker === 'docvault-identity-burst-preview' && preview.public_worker_targets === 0
        && preview.designated_synthetic_identities_only === true && preview.business_routes_enabled === false
        && preview.collaboration_enabled === false, 'Preview isolation drifted');
    assert(wrangler.env?.preview?.d1_databases?.length === 1
        && wrangler.env.preview.d1_databases[0].binding === 'COLLAB_DB'
        && wrangler.env.preview.services?.length === 1
        && wrangler.env.preview.services[0].binding === 'AUTH_BURST_SERVICE'
        && wrangler.env.preview.services[0].service === preview.private_worker, 'Preview bindings drifted');
    assert(!wrangler.env?.production?.d1_databases && !wrangler.env?.production?.services
        && wrangler.env?.production?.vars?.IDENTITY_RUNTIME_MODE === 'disabled'
        && wrangler.env.production.vars.COLLABORATION_ENABLED === 'false', 'Production isolation drifted');

    const rate = manifest.rate_control || {};
    assert(rate.edge_limit === 6 && rate.edge_period_seconds === 60
        && rate.edge_semantics === 'per-location-permissive-eventually-consistent-early-shield'
        && rate.authoritative_d1_limit === 20 && rate.authoritative_d1_period_seconds === 600
        && rate.failure_mode === 'fail-closed-generic-429', 'Rate control evidence drifted');
    assert(burstWrangler.name === preview.private_worker && burstWrangler.workers_dev === false
        && !burstWrangler.routes && burstWrangler.ratelimits?.length === 1
        && burstWrangler.ratelimits[0].name === 'AUTH_BURST_LIMITER'
        && burstWrangler.ratelimits[0].simple?.limit === 6
        && burstWrangler.ratelimits[0].simple?.period === 60, 'Private limiter configuration drifted');
    assert(runtimeSource.includes("Reflect.get(value, 'fetch')")
        && runtimeSource.indexOf("Reflect.get(value, 'fetch')") < runtimeSource.indexOf("'limit' in value"),
    'Service Fetcher must be preferred over RPC-shaped methods');
    assert(workerSource.includes('env.AUTH_BURST_LIMITER') && !workerSource.includes('console.'),
        'Private Worker boundary or logging drifted');

    assert(same(manifest.live_boundary_results, {
        preview_session: 200, wrong_origin_transaction: 403, preview_business_route: 404,
        production_session: 503, github_pages_session: 404,
        preview_transaction_success_observed: true, service_binding_invocation_observed: true
    }), 'Live boundary matrix drifted');
    assert(Object.values(manifest.cleanup_counts || {}).length === 6
        && Object.values(manifest.cleanup_counts).every(value => value === 0), 'Preview cleanup is incomplete');
    assert(manifest.production?.identity_enabled === false && manifest.production.d1_bindings === 0
        && manifest.production.burst_service_bindings === 0 && manifest.production.identity_secrets === 0
        && manifest.github_pages?.identity_enabled === false, 'Fallback isolation drifted');
    assert(same(manifest.evidence, PREVIEW_IDENTITY_EVIDENCE)
        && same(Object.keys(evidenceSources).sort(), [...PREVIEW_IDENTITY_EVIDENCE].sort())
        && Object.entries(evidenceSources).every(([id, source]) => source.startsWith(`# ${id} `)
            && /^Status: PASS$/m.test(source) && source.includes('CF-P3-008')), 'Preview evidence inventory drifted');
    assert(manifest.next_decision?.gate === 'P3-G4A' && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P3-009-only'
        && manifest.next_decision.collaboration_activation === 'NO-GO', 'Next gate boundary drifted');
    return true;
}
