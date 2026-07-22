const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const sameSet = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
const ROUTES = [
    'POST /api/v1/oauth/github/transactions',
    'GET /api/v1/oauth/github/callback',
    'GET /api/v1/session',
    'POST /api/v1/session/logout'
];
const EVIDENCE = ['CF-EV-P3-STA-001', 'CF-EV-P3-SEC-001'];
const SECRET_BINDINGS = ['GITHUB_OAUTH_CLIENT_SECRET', 'OAUTH_TRANSACTION_KEY', 'SESSION_TOKEN_PEPPER', 'CSRF_TOKEN_KEY', 'RATE_LIMIT_KEY'];

function ratePeriods(schema) {
    const matches = [];
    const walk = value => {
        if (!value || typeof value !== 'object') return;
        if (value.properties?.ratelimits?.items?.properties?.simple?.properties?.period?.enum) {
            matches.push(value.properties.ratelimits.items.properties.simple.properties.period.enum);
        }
        Object.values(value).forEach(walk);
    };
    walk(schema);
    return matches;
}

export function validatePhase3ContractFreeze({ manifest, sprintManifest, sprintSource, contractSource, evidenceSources,
    wrangler, branchControl, migrationManifest, wranglerSchema, gitignore, operationalRunbook }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P3'
        && manifest.story === 'CF-P3-001' && manifest.status === 'PASS', 'Unsupported Phase 3 contract freeze');
    assert(manifest.gate_authorization?.id === 'P3-G0'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P3-001'
        && manifest.gate_authorization.next_gate === 'P3-G1'
        && manifest.gate_authorization.next_story === 'CF-P3-002', 'P3-G0 authorization drifted');
    const scope = manifest.scope || {};
    for (const key of ['runtime_code_changes', 'schema_migrations_added', 'remote_writes', 'oauth_apps_created', 'secrets_created_or_changed']) {
        assert(scope[key] === 0, `CF-P3-001 performed prohibited work: ${key}`);
    }
    for (const key of ['identity_enabled', 'collaboration_enabled', 'business_routes_enabled']) {
        assert(scope[key] === false, `CF-P3-001 enabled prohibited scope: ${key}`);
    }

    assert(sprintManifest.status === 'ACTIVE'
        && sprintManifest.authorization?.gate === 'P3-G4B'
        && sprintManifest.authorization.decision === 'APPROVED'
        && sprintManifest.authorization.authorized_story === 'CF-P3-008'
        && sprintManifest.stories?.find(story => story.id === 'CF-P3-001')?.status === 'PASS'
        && sprintManifest.stories?.find(story => story.id === 'CF-P3-002')?.status === 'PASS'
        && sprintManifest.stories?.find(story => story.id === 'CF-P3-003')?.status === 'PASS'
        && sprintManifest.stories?.find(story => story.id === 'CF-P3-004')?.status === 'PASS'
        && sprintManifest.stories?.find(story => story.id === 'CF-P3-005')?.status === 'PASS'
        && sprintManifest.stories?.find(story => story.id === 'CF-P3-006')?.status === 'PASS'
        && sprintManifest.stories?.find(story => story.id === 'CF-P3-007')?.status === 'PASS'
        && sprintManifest.stories?.find(story => story.id === 'CF-P3-008')?.status === 'PASS'
        && sprintManifest.stories.filter(story => !['CF-P3-001', 'CF-P3-002', 'CF-P3-003', 'CF-P3-004', 'CF-P3-005', 'CF-P3-006', 'CF-P3-007', 'CF-P3-008'].includes(story.id))
            .every(story => story.status === 'PLANNED'), 'Sprint disposition drifted');
    assert(sprintSource.includes('`CF-P3-008` PASS; awaiting Product Owner approval at Gate P3-G4A'), 'Sprint status text drifted');
    assert(contractSource.includes('`CF-P3-008` PASS; awaiting Gate P3-G4A approval'), 'Contract status text drifted');

    const observations = manifest.platform_observations || {};
    assert(observations.cloudflare_pages?.project === branchControl.project_name
        && observations.cloudflare_pages.production_branch === branchControl.production_branch
        && sameSet(observations.cloudflare_pages.preview_branch_includes || [], branchControl.preview_branch_includes || [])
        && sameSet(observations.cloudflare_pages.preview_branch_excludes || [], branchControl.preview_branch_excludes || [])
        && observations.cloudflare_pages.production_d1_bindings === 0
        && sameSet(observations.cloudflare_pages.preview_d1_bindings || [], ['COLLAB_DB']), 'Pages observation drifted');
    const periods = ratePeriods(wranglerSchema);
    assert(periods.length > 0 && periods.every(period => sameSet(period, [10, 60]))
        && sameSet(observations.wrangler?.supported_simple_period_seconds || [], [10, 60])
        && observations.wrangler.rate_limit_binding_cannot_express_600_second_window === true, 'Wrangler rate-limit capability drifted');
    assert(observations.github_oauth?.pkce_method === 'S256'
        && observations.github_oauth.temporary_code_lifetime_seconds === 600
        && observations.github_oauth.stable_identity_field === 'id', 'GitHub OAuth platform profile drifted');

    const environment = manifest.environment_contract || {};
    assert(environment.preview?.branch === 'codex-cf-p3-preview'
        && environment.preview.origin === 'https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev'
        && environment.preview.callback === `${environment.preview.origin}/api/v1/oauth/github/callback`
        && sameSet(environment.preview.required_branch_control_includes || [], ['codex-cf-p3-preview'])
        && environment.production?.identity_mode === 'disabled'
        && environment.production.d1_bindings === 0
        && environment.production.oauth_or_session_secrets === 0
        && environment.github_pages?.identity_mode === 'absent', 'Environment isolation contract drifted');
    assert(environment.enable_predicate?.includes('COLLABORATION_ENABLED=false')
        && environment.enable_predicate.includes('request.origin=approved-preview-origin'), 'Preview enable predicate is incomplete');

    assert(sameSet((manifest.route_contract || []).map(route => `${route.method} ${route.path}`), ROUTES), 'Identity route scope drifted');
    assert(manifest.route_contract.every(route => route.cache === 'no-store-private'), 'Identity route cache policy drifted');
    const oauth = manifest.oauth_contract || {};
    assert(oauth.authorize_endpoint === 'https://github.com/login/oauth/authorize'
        && oauth.token_endpoint === 'https://github.com/login/oauth/access_token'
        && oauth.identity_endpoint === 'https://api.github.com/user'
        && oauth.requested_scopes?.length === 0
        && oauth.state?.random_bytes === 32 && oauth.state.encoded_length === 43
        && oauth.pkce?.verifier_random_bytes === 64 && oauth.pkce.verifier_encoded_length === 86
        && oauth.pkce.method === 'S256' && oauth.transaction_ttl_seconds === 600
        && oauth.provider_token_storage === 'prohibited', 'OAuth protocol contract drifted');
    assert(oauth.transaction_envelope?.algorithm === 'AES-256-GCM'
        && oauth.transaction_envelope.plaintext_encoding === 'utf8-json-exact-property-order-no-extra-fields'
        && oauth.transaction_envelope.aad_encoding === 'versioned-length-prefixed-utf8-tuple'
        && sameSet(oauth.transaction_envelope.payload || [], ['verifier', 'purpose', 'returnPath', 'initiatingSessionId', 'initiatingUserId'])
        && sameSet(oauth.transaction_envelope.aad || [], ['transactionId', 'callbackOrigin', 'callbackPath', 'createdAt', 'expiresAt'])
        && oauth.transaction_envelope.maximum_bytes === 4096, 'OAuth envelope contract drifted');
    assert(sameSet(oauth.callback_atomic_batch || [], ['compare-and-set-pending-transaction-to-consumed',
        'upsert-user-by-provider-and-numeric-subject', 'revoke-predecessor-session-when-applicable', 'insert-successor-session']), 'Callback atomicity drifted');
    assert(oauth.provider_resilience?.token_exchange_automatic_retries === 0
        && oauth.provider_resilience.identity_lookup_retries === 1
        && oauth.provider_resilience.overall_provider_budget_ms === 8000, 'Provider resilience contract drifted');

    const returnPath = manifest.return_path_contract || {};
    assert(returnPath.default === '/' && returnPath.maximum_utf8_bytes === 512
        && returnPath.must_start_with === '/' && returnPath.must_not_start_with === '//'
        && returnPath.allow_fragment === false
        && sameSet(returnPath.forbidden_query_keys_case_insensitive || [], ['code', 'state', 'token', 'access_token', 'invite', 'invitation']), 'Safe return-path contract drifted');
    for (const required of ['scheme-or-host', 'backslash-or-percent-encoded-backslash', 'ascii-control-or-percent-encoded-control', 'invalid-percent-encoding']) {
        assert(returnPath.reject?.includes(required), `Safe return-path rejection missing: ${required}`);
    }

    const keys = manifest.key_contract || {};
    assert(keys.secret_encoding === 'versioned-json-keyring-with-base64url-32-byte-keys'
        && keys.maximum_keys_per_ring === 2
        && keys.keyring_schema?.version === 1
        && keys.keyring_schema.unknown_fields === 'rejected'
        && keys.derivation?.algorithm === 'HKDF-SHA-256'
        && keys.derivation.output_bytes === 32
        && keys.comparison === 'crypto.subtle.verify-hmac-no-direct-secret-string-comparison', 'Keyring contract drifted');
    assert(sameSet([keys.oauth_transaction_key?.binding, keys.session_token_pepper?.binding,
        keys.csrf_token_key?.binding, keys.rate_limit_key?.binding], ['OAUTH_TRANSACTION_KEY', 'SESSION_TOKEN_PEPPER', 'CSRF_TOKEN_KEY', 'RATE_LIMIT_KEY']), 'Key binding inventory drifted');
    const labels = [keys.oauth_transaction_key?.derived_labels?.[0], keys.oauth_transaction_key?.derived_labels?.[1],
        keys.session_token_pepper?.derived_label, keys.csrf_token_key?.derived_label, keys.rate_limit_key?.derived_label];
    assert(labels.length === new Set(labels).size && labels.every(Boolean), 'Cryptographic domain labels must be unique');

    const session = manifest.session_contract || {};
    assert(session.token_random_bytes === 32 && session.d1_storage === 'hmac-sha256-digest-only'
        && session.cookie_preview === '__Host-docvault-preview-session'
        && session.cookie_production_reserved === '__Host-docvault-session'
        && session.idle_seconds === 43200 && session.absolute_seconds === 604800
        && session.recent_auth_seconds === 900 && session.last_seen_write_coalesce_seconds === 300
        && session.csrf?.d1_storage === 'none' && session.csrf.raw_token_storage === 'browser-memory-only', 'Session/CSRF contract drifted');
    assert(sameSet(session.cookie_attributes || [], ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'no-Domain']), 'Cookie attributes drifted');

    const rate = manifest.rate_limit_contract || {};
    assert(rate.decision === 'hybrid-edge-burst-plus-d1-authoritative-window'
        && rate.edge_burst_shield?.limit === 6 && rate.edge_burst_shield.period_seconds === 60
        && rate.authoritative_oauth_window?.limit === 20 && rate.authoritative_oauth_window.period_seconds === 600
        && rate.authoritative_oauth_window.source_ip_authority.includes('CF-Connecting-IP')
        && rate.authoritative_oauth_window.migration_story === 'CF-P3-007'
        && rate.authoritative_oauth_window.migration_requires_gate === 'P3-G3'
        && rate.process_local_limiter === 'prohibited' && rate.silent_schema_change === 'prohibited', 'Rate-limit decision drifted');
    assert(migrationManifest.entries?.length === 11 && migrationManifest.entries[10]?.sequence === 11 && migrationManifest.entries[10]?.story === 'CF-P5-004' && migrationManifest.entries[10]?.gate === 'P5-G2A-M'
        && migrationManifest.entries[9]?.story === 'CF-P3-007'
        && migrationManifest.entries[9]?.gate === 'P3-G3'
        && JSON.stringify(migrationManifest.entries[9]?.tables) === JSON.stringify(['auth_rate_windows']),
    'Migration set contains an unauthorized post-contract change');

    assert(!wrangler.env?.production?.d1_databases && !wrangler.env?.production?.ratelimits
        && !wrangler.env?.production?.secrets && wrangler.env?.production?.vars?.IDENTITY_RUNTIME_MODE !== 'preview-only',
    'Identity activation escaped into production');
    assert(SECRET_BINDINGS.every(name => operationalRunbook.includes(`\`${name}\``)), 'Operational secret inventory is incomplete');
    assert(gitignore.split(/\r?\n/).includes('.dev.vars*') && gitignore.split(/\r?\n/).includes('.env*'), 'Local secret files are not ignored');

    assert(sameSet(manifest.evidence || [], EVIDENCE) && sameSet(Object.keys(evidenceSources), EVIDENCE), 'CF-P3-001 evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source) && source.includes('CF-P3-001'), `${id} is not valid PASS evidence`);
    }
    for (const id of ['T01', 'T02', 'T03', 'R01', 'R02', 'R15', 'R16', 'R17', 'R20', 'R21', 'R22']) {
        assert(contractSource.includes(id), `Contract lacks threat/risk trace ${id}`);
    }
    assert(manifest.next_decision?.gate === 'P3-G1'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P3-002-only'
        && manifest.next_decision.remote_changes_authorized === false, 'Next-gate recommendation drifted');
    return true;
}

export { ROUTES, EVIDENCE, SECRET_BINDINGS };
