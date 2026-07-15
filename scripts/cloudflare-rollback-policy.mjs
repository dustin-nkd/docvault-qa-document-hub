import { validatePagesRoutesDocument } from './cloudflare-deployment-boundary-policy.mjs';

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export function rollbackTargetSourcesAvailable(probe, commit, paths) {
    assert(typeof probe === 'function', 'Rollback source probe is required');
    assert(/^[0-9a-f]{40}$/.test(commit), 'Rollback source commit must be a full SHA');
    assert(Array.isArray(paths) && paths.length > 0, 'Rollback source paths are required');
    return probe(`${commit}^{commit}`) && paths.every(relativePath => probe(`${commit}:${relativePath}`));
}

export function validateRollbackRehearsal(plan, previousWranglerSource, previousRoutesSource, previousPackageLockSource) {
    assert(plan?.schema_version === 1, 'Unsupported rollback rehearsal schema');
    assert(plan.story === 'CF-P1-008', 'Rollback rehearsal story drifted');
    assert(plan.mode === 'read-only', 'Rollback rehearsal must be non-destructive');
    assert(plan.recovery_strategy === 'revert-and-redeploy', 'Rollback strategy must preserve main-branch history');
    assert(/^[0-9a-f]{40}$/.test(plan.previous_compatible_commit), 'Previous compatible commit must be a full SHA');
    assert(/^[0-9a-f-]{36}$/.test(plan.previous_cloudflare_deployment_id), 'Previous Cloudflare deployment ID is invalid');
    assert(plan.expected_collaboration_enabled === 'false', 'Rollback target must keep collaboration disabled');
    const fingerprints = plan.target_fingerprints;
    assert(fingerprints && typeof fingerprints === 'object', 'Rollback target fingerprints are missing');
    for (const key of ['wrangler_sha256', 'routes_sha256', 'package_lock_sha256']) {
        assert(/^[0-9a-f]{64}$/.test(fingerprints[key]), `Rollback fingerprint is invalid: ${key}`);
    }
    assert(fingerprints.lockfile_version === 3, 'Rollback fingerprint lockfile version drifted');
    assert(fingerprints.wrangler_version === '4.111.0', 'Rollback fingerprint Wrangler version drifted');
    assert(JSON.stringify(fingerprints.functions_include) === JSON.stringify(['/api/v1/*']), 'Rollback route fingerprint drifted');

    const wrangler = JSON.parse(previousWranglerSource);
    const states = [wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars];
    assert(states.every(vars => vars?.COLLABORATION_ENABLED === 'false'), 'Rollback target does not fail closed in every environment');
    assert(!/d1_databases|database_id|COLLAB_DB|remote\s*"?\s*:\s*true/i.test(previousWranglerSource), 'Rollback target contains a remote or D1 resource');
    validatePagesRoutesDocument(JSON.parse(previousRoutesSource));

    const lock = JSON.parse(previousPackageLockSource);
    assert(lock.lockfileVersion === 3, 'Rollback target must retain npm lockfile v3');
    assert(lock.packages?.['']?.devDependencies?.wrangler === '4.111.0', 'Rollback target Wrangler lock drifted');
    return true;
}
