import fs from 'node:fs';

export const canonicalProductionOrigin = 'https://docvault-qa-document-hub.pages.dev';
export const approvedPreviewD1 = {
    binding: 'COLLAB_DB',
    database_name: 'docvault-collab-preview',
    database_id: '0454359c-d663-409e-8962-951f173efb79',
    migrations_dir: 'migrations/collaboration',
    migrations_table: 'd1_migrations'
};
export const approvedPreviewBurstService = {
    binding: 'AUTH_BURST_SERVICE',
    service: 'docvault-identity-burst-preview'
};

export const expectedEnvironmentVars = {
    local: {
        APP_ENV: 'local',
        ORIGIN_POLICY_MODE: 'local',
        CANONICAL_PRODUCTION_ORIGIN: canonicalProductionOrigin,
        COLLABORATION_ENABLED: 'false',
        IDENTITY_RUNTIME_MODE: 'disabled'
    },
    preview: {
        APP_ENV: 'preview',
        ORIGIN_POLICY_MODE: 'preview',
        CANONICAL_PRODUCTION_ORIGIN: canonicalProductionOrigin,
        COLLABORATION_ENABLED: 'false',
        IDENTITY_RUNTIME_MODE: 'preview-only'
    },
    production: {
        APP_ENV: 'production',
        ORIGIN_POLICY_MODE: 'production',
        CANONICAL_PRODUCTION_ORIGIN: canonicalProductionOrigin,
        COLLABORATION_ENABLED: 'false',
        IDENTITY_RUNTIME_MODE: 'disabled'
    }
};

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const exactKeys = (value, expected, label) => {
    const actual = Object.keys(value || {}).sort();
    const allowed = [...expected].sort();
    assert(JSON.stringify(actual) === JSON.stringify(allowed), `${label} keys drifted: ${actual.join(', ')}`);
};

export function parseWranglerConfig(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    try {
        return { config: JSON.parse(source), source };
    } catch (error) {
        throw new Error(`wrangler.jsonc must remain deterministic JSON-compatible JSONC: ${error.message}`);
    }
}

export function validateWranglerConfig(config, source, compatibilityDate = '2026-07-15') {
    exactKeys(config, [
        '$schema', 'name', 'pages_build_output_dir', 'compatibility_date',
        'compatibility_flags', 'vars', 'env'
    ], 'wrangler');
    assert(config.$schema === './node_modules/wrangler/config-schema.json', 'Wrangler schema reference drifted');
    assert(config.name === 'docvault-qa-document-hub', 'Wrangler project name drifted');
    assert(config.pages_build_output_dir === './_site', 'Wrangler Pages output must remain ./_site');
    assert(config.compatibility_date === compatibilityDate, 'Wrangler compatibility date drifted');
    assert(JSON.stringify(config.compatibility_flags) === '["nodejs_compat"]', 'Wrangler must use only nodejs_compat');

    exactKeys(config.env, ['preview', 'production'], 'wrangler.env');
    exactKeys(config.env.preview, ['d1_databases', 'services', 'vars'], 'wrangler.env.preview');
    exactKeys(config.env.production, ['vars'], 'wrangler.env.production');
    assert(JSON.stringify(config.env.preview.d1_databases) === JSON.stringify([approvedPreviewD1]), 'Preview D1 binding drifted');
    assert(JSON.stringify(config.env.preview.services) === JSON.stringify([approvedPreviewBurstService]),
        'Preview burst-limiter service binding drifted');
    assert(!config.services && !config.env.production.services, 'Burst-limiter service escaped Preview');
    for (const [environment, vars] of [
        ['local', config.vars],
        ['preview', config.env.preview.vars],
        ['production', config.env.production.vars]
    ]) {
        exactKeys(vars, Object.keys(expectedEnvironmentVars[environment]), `wrangler.${environment}.vars`);
        assert(JSON.stringify(vars) === JSON.stringify(expectedEnvironmentVars[environment]), `${environment} variables drifted`);
        assert(vars.COLLABORATION_ENABLED === 'false', `${environment} collaboration must use the exact disabled string`);
    }
    assert(config.vars.IDENTITY_RUNTIME_MODE === 'disabled'
        && config.env.preview.vars.IDENTITY_RUNTIME_MODE === 'preview-only'
        && config.env.production.vars.IDENTITY_RUNTIME_MODE === 'disabled', 'Identity runtime environment boundary drifted');
    assert(config.env.preview.vars.APP_ENV !== config.env.production.vars.APP_ENV, 'Preview and production APP_ENV must differ');
    assert(config.env.preview.vars.ORIGIN_POLICY_MODE !== config.env.production.vars.ORIGIN_POLICY_MODE, 'Preview and production origin policies must differ');

    const prohibited = [
        /\baccount_id\b/i,
        /\bkv_namespaces\b/i,
        /\br2_buckets\b/i,
        /\bdurable_objects\b/i,
        /\bhyperdrive\b/i,
        /\bqueues\b/i,
        /\bsecret(?:s)?\b/i,
        /\btoken\b/i,
        /<[^>]+>/,
        /\b(?:TODO|TBD|PLACEHOLDER)\b/i,
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
        /\b[0-9a-f]{32}\b/i
    ];
    const sourceWithoutApprovedId = source.replace(approvedPreviewD1.database_id, '');
    assert(!prohibited.some((pattern) => pattern.test(sourceWithoutApprovedId)), 'Wrangler config contains a prohibited binding, resource identifier, secret, or placeholder');
    return true;
}

export function withoutApprovedPreviewD1(config) {
    assert(JSON.stringify(config?.env?.preview?.d1_databases) === JSON.stringify([approvedPreviewD1]), 'Approved preview D1 binding is missing or drifted');
    assert(!config.d1_databases && !config.env?.production?.d1_databases, 'D1 binding escaped the preview environment');
    assert(JSON.stringify(config?.env?.preview?.services) === JSON.stringify([approvedPreviewBurstService]),
        'Approved preview burst service binding is missing or drifted');
    assert(!config.services && !config.env?.production?.services, 'Burst service binding escaped the preview environment');
    const historical = structuredClone(config);
    delete historical.env.preview.d1_databases;
    delete historical.env.preview.services;
    return historical;
}

export function validateGeneratedWorkerTypes(source) {
    assert(/interface\s+Env\s*\{/.test(source), 'Generated Env interface is missing');
    for (const [name, values] of [
        ['APP_ENV', ['"local"', '"preview"', '"production"']],
        ['ORIGIN_POLICY_MODE', ['"local"', '"preview"', '"production"']],
        ['CANONICAL_PRODUCTION_ORIGIN', [`"${canonicalProductionOrigin}"`]],
        ['COLLABORATION_ENABLED', ['"false"']]
        ,['IDENTITY_RUNTIME_MODE', ['"disabled"', '"preview-only"']]
    ]) {
        assert(new RegExp(`\\b${name}\\b`).test(source), `Generated Env type is missing ${name}`);
        for (const value of values) assert(source.includes(value), `Generated Env type is missing ${name} value ${value}`);
    }
    const envBlock = source.match(/interface\s+__BaseEnv_Env\s*\{([\s\S]*?)\n\}/)?.[1] || '';
    assert(envBlock, 'Generated base Env interface is missing');
    for (const prohibited of ['KVNamespace', 'R2Bucket', 'DurableObjectNamespace']) {
        assert(!envBlock.includes(prohibited), `Generated Env unexpectedly contains ${prohibited}`);
    }
    assert(source.includes('COLLAB_DB: D1Database'), 'Generated types are missing the approved preview D1 binding');
    assert(source.includes('AUTH_BURST_SERVICE: Fetcher'), 'Generated types are missing the preview burst service binding');
    assert(!source.includes('AUTH_BURST_LIMITER'), 'Pages types unexpectedly contain the Worker rate-limit binding');
    assert(!/\b(?:GITHUB_OAUTH|SESSION_TOKEN|OAUTH_TRANSACTION_KEY|CSRF_TOKEN_KEY|RATE_LIMIT_KEY|PREVIEW_ALLOWED_GITHUB_SUBJECTS|CURSOR_SIGNING)\b/.test(source), 'Generated types contain a secret');
    return true;
}

export function validateBurstWorkerConfig(config, source, compatibilityDate = '2026-07-15') {
    exactKeys(config, ['$schema', 'name', 'main', 'compatibility_date', 'compatibility_flags',
        'workers_dev', 'observability', 'ratelimits'], 'identity burst Worker');
    assert(config.$schema === './node_modules/wrangler/config-schema.json', 'Burst Worker schema reference drifted');
    assert(config.name === approvedPreviewBurstService.service, 'Burst Worker name drifted');
    assert(config.main === './workers/identity-burst-limiter.ts', 'Burst Worker entrypoint drifted');
    assert(config.compatibility_date === compatibilityDate, 'Burst Worker compatibility date drifted');
    assert(JSON.stringify(config.compatibility_flags) === '["nodejs_compat"]', 'Burst Worker flags drifted');
    assert(config.workers_dev === false, 'Burst Worker must not expose a workers.dev route');
    assert(JSON.stringify(config.observability) === JSON.stringify({ enabled: true, head_sampling_rate: 0.1 }),
        'Burst Worker observability drifted');
    assert(JSON.stringify(config.ratelimits) === JSON.stringify([{
        name: 'AUTH_BURST_LIMITER', namespace_id: '1010', simple: { limit: 6, period: 60 }
    }]), 'Burst Worker rate-limit binding drifted');
    assert(!/\b(?:vars|env|routes|route|services|d1_databases|kv_namespaces|r2_buckets|durable_objects|secret|token)\b/i
        .test(source), 'Burst Worker config contains an unauthorized exposure, binding, variable, or secret');
    return true;
}

export function validateGeneratedBurstWorkerTypes(source) {
    assert(/interface\s+Env\s*\{/.test(source), 'Burst Worker Env interface is missing');
    assert(source.includes('AUTH_BURST_LIMITER: RateLimit'), 'Burst Worker RateLimit binding type is missing');
    assert(!/\b(?:COLLAB_DB|AUTH_BURST_SERVICE|GITHUB_OAUTH|SESSION_TOKEN|OAUTH_TRANSACTION|CSRF_TOKEN|RATE_LIMIT_KEY)\b/
        .test(source), 'Burst Worker types contain an unauthorized binding or secret');
    return true;
}

export function validateDashboardToWranglerDiff(config, baselineDocument, diff) {
    const baseline = baselineDocument.snapshot;
    assert(diff.schema_version === 1, 'Dashboard-to-Wrangler diff schema drifted');
    assert(diff.baseline === 'config/cloudflare/pages-project-baseline.json', 'Wrangler diff baseline path drifted');
    assert(diff.target === 'wrangler.jsonc', 'Wrangler diff target path drifted');
    assert(diff.approval === 'CF-P1-003 approved by Product Owner', 'Wrangler transition is not approved');
    assert(baseline.project_name === config.name, 'Dashboard and Wrangler project names differ');
    assert(baseline.production_branch === 'main', 'Dashboard production branch drifted');
    assert(`./${baseline.build_config.destination_dir}` === config.pages_build_output_dir, 'Dashboard and Wrangler outputs differ');
    assert(baseline.environments.preview.compatibility_date === config.compatibility_date, 'Preview compatibility date drifted');
    assert(baseline.environments.production.compatibility_date === config.compatibility_date, 'Production compatibility date drifted');

    const names = ['APP_ENV', 'CANONICAL_PRODUCTION_ORIGIN', 'COLLABORATION_ENABLED', 'ORIGIN_POLICY_MODE'].sort();
    const expectedDiff = {
        preview_compatibility_flags: { before: [], after: ['nodejs_compat'] },
        production_compatibility_flags: { before: [], after: ['nodejs_compat'] },
        preview_environment_variable_names: { before: [], after: names },
        production_environment_variable_names: { before: [], after: names }
    };
    assert(JSON.stringify(diff.changes) === JSON.stringify(expectedDiff), 'Dashboard-to-Wrangler change inventory drifted');
    assert(JSON.stringify(diff.unchanged) === JSON.stringify({
        project_name: config.name,
        production_branch: 'main',
        pages_build_output_dir: '_site',
        compatibility_date: config.compatibility_date
    }), 'Dashboard-to-Wrangler unchanged inventory drifted');
    assert(JSON.stringify(diff.remote_binding_names) === JSON.stringify({ preview: [], production: [] }), 'Wrangler transition contains remote bindings');

    for (const environment of ['preview', 'production']) {
        const current = baseline.environments[environment];
        assert(current.environment_variable_names.length === 0, `Baseline ${environment} variables were not empty`);
        for (const field of Object.keys(current).filter((key) => key.endsWith('_binding_names'))) {
            assert(current[field].length === 0, `Baseline ${environment} binding ${field} was not empty`);
        }
    }
    return true;
}
