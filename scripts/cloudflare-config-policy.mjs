import fs from 'node:fs';

const exactKeys = (value, expected, label) => {
    const actual = Object.keys(value || {}).sort();
    const allowed = [...expected].sort();
    if (JSON.stringify(actual) !== JSON.stringify(allowed)) {
        throw new Error(`${label} keys changed: expected ${allowed.join(', ')}, received ${actual.join(', ')}`);
    }
};

const bindingNameFields = [
    'environment_variable_names',
    'd1_binding_names',
    'kv_binding_names',
    'r2_binding_names',
    'durable_object_binding_names',
    'service_binding_names',
    'queue_producer_binding_names',
    'analytics_engine_binding_names',
    'hyperdrive_binding_names'
];

const assertStringArray = (value, label, pattern = /^[A-Z][A-Z0-9_]*$/) => {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !pattern.test(item))) {
        throw new Error(`${label} must be an array of safe names`);
    }
    if (new Set(value).size !== value.length || JSON.stringify(value) !== JSON.stringify([...value].sort())) {
        throw new Error(`${label} must be unique and sorted`);
    }
};

const assertEnvironment = (environment, label) => {
    exactKeys(environment, ['compatibility_date', 'compatibility_flags', ...bindingNameFields], label);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(environment.compatibility_date)) {
        throw new Error(`${label}.compatibility_date must use YYYY-MM-DD`);
    }
    assertStringArray(environment.compatibility_flags, `${label}.compatibility_flags`, /^[a-z][a-z0-9_]*$/);
    for (const field of bindingNameFields) assertStringArray(environment[field], `${label}.${field}`);
};

const findDifference = (expected, actual, path = 'snapshot') => {
    if (Object.is(expected, actual)) return null;
    if (Array.isArray(expected) || Array.isArray(actual)) {
        return JSON.stringify(expected) === JSON.stringify(actual) ? null : path;
    }
    if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
        const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
        for (const key of keys) {
            const difference = findDifference(expected[key], actual[key], `${path}.${key}`);
            if (difference) return difference;
        }
        return null;
    }
    return path;
};

export function readPagesSnapshot(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function validatePagesSnapshotDocument(document, expectedDocument = null) {
    exactKeys(document, ['schema_version', 'captured_at_utc', 'capture_method', 'snapshot'], 'document');
    if (document.schema_version !== 1) throw new Error('Unsupported Pages snapshot schema version');
    if (!Number.isFinite(Date.parse(document.captured_at_utc))) throw new Error('captured_at_utc must be an ISO timestamp');
    if (document.capture_method !== 'Cloudflare Pages project API with an allow-list transform') {
        throw new Error('Pages snapshot must use the approved allow-list capture method');
    }

    const snapshot = document.snapshot;
    exactKeys(snapshot, [
        'project_name', 'canonical_subdomain', 'production_branch', 'build_config',
        'deployment_source', 'environments'
    ], 'snapshot');
    if (snapshot.project_name !== 'docvault-qa-document-hub') throw new Error('Cloudflare Pages project name drifted');
    if (snapshot.canonical_subdomain !== 'docvault-qa-document-hub.pages.dev') throw new Error('Canonical Pages subdomain drifted');
    if (snapshot.production_branch !== 'main') throw new Error('Cloudflare Pages production branch must remain main');

    exactKeys(snapshot.build_config, ['build_command', 'destination_dir', 'root_dir'], 'snapshot.build_config');
    if (snapshot.build_config.destination_dir !== '_site') throw new Error('Cloudflare Pages output directory must remain _site');
    if (snapshot.build_config.root_dir !== '') throw new Error('Cloudflare Pages root directory must remain the repository root');
    if (snapshot.build_config.build_command !== 'npm run check && npm run build:css && npm run build:pages') {
        throw new Error('Cloudflare Pages build command drifted');
    }

    exactKeys(snapshot.deployment_source, [
        'type', 'owner', 'repository', 'production_branch', 'deployments_enabled',
        'production_deployments_enabled', 'preview_deployment_setting', 'path_includes', 'path_excludes'
    ], 'snapshot.deployment_source');
    if (snapshot.deployment_source.type !== 'github'
        || snapshot.deployment_source.owner !== 'dustin-nkd'
        || snapshot.deployment_source.repository !== 'docvault-qa-document-hub'
        || snapshot.deployment_source.production_branch !== 'main') {
        throw new Error('Cloudflare Pages Git deployment source drifted');
    }
    if (snapshot.deployment_source.deployments_enabled !== true
        || snapshot.deployment_source.production_deployments_enabled !== true) {
        throw new Error('Cloudflare Pages Git deployments must remain enabled');
    }
    if (snapshot.deployment_source.preview_deployment_setting !== 'all') {
        throw new Error('Cloudflare Pages preview deployment policy drifted');
    }
    if (JSON.stringify(snapshot.deployment_source.path_includes) !== '["*"]'
        || JSON.stringify(snapshot.deployment_source.path_excludes) !== '[]') {
        throw new Error('Cloudflare Pages deployment path policy drifted');
    }

    exactKeys(snapshot.environments, ['preview', 'production'], 'snapshot.environments');
    assertEnvironment(snapshot.environments.preview, 'snapshot.environments.preview');
    assertEnvironment(snapshot.environments.production, 'snapshot.environments.production');

    const serialized = JSON.stringify(document);
    const prohibited = [
        /account[_-]?id/i,
        /database[_-]?id/i,
        /namespace[_-]?id/i,
        /client[_-]?secret/i,
        /session[_-]?secret/i,
        /api[_-]?token/i,
        /-----BEGIN [A-Z ]+PRIVATE KEY-----/i,
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
        /\b[0-9a-f]{32}\b/i
    ];
    if (prohibited.some((pattern) => pattern.test(serialized))) {
        throw new Error('Pages snapshot contains a prohibited resource identifier or secret field');
    }

    if (expectedDocument) {
        validatePagesSnapshotDocument(expectedDocument);
        const difference = findDifference(expectedDocument.snapshot, snapshot);
        if (difference) throw new Error(`Cloudflare Pages configuration drift detected at ${difference}`);
    }
    return true;
}
