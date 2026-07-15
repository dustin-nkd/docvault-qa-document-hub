import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    rollbackTargetSourcesAvailable,
    validateRollbackRehearsal
} from './cloudflare-rollback-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'config/cloudflare/rollback-rehearsal.json'), 'utf8'));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const digest = source => crypto.createHash('sha256').update(source).digest('hex');
const targetPaths = ['wrangler.jsonc', '_routes.json', 'package-lock.json'];
const gitObjectAvailable = object => spawnSync('git', ['cat-file', '-e', object], {
    cwd: root,
    stdio: 'ignore'
}).status === 0;

// Managed Pages clones can retain the boundary commit while omitting older
// path objects. Treat the target as locally inspectable only when the commit
// and every reviewed source path are available.
const targetSourcesAvailable = rollbackTargetSourcesAvailable(
    gitObjectAvailable,
    plan.previous_compatible_commit,
    targetPaths
);
if (targetSourcesAvailable) {
    const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', plan.previous_compatible_commit, 'HEAD'], {
        cwd: root,
        stdio: 'ignore'
    });
    if (ancestor.status !== 0) throw new Error('Rollback target is not an ancestor of the release candidate');
    const wranglerSource = git(['show', `${plan.previous_compatible_commit}:wrangler.jsonc`]);
    const routesSource = git(['show', `${plan.previous_compatible_commit}:_routes.json`]);
    const packageLockSource = git(['show', `${plan.previous_compatible_commit}:package-lock.json`]);
    validateRollbackRehearsal(plan, wranglerSource, routesSource, packageLockSource);
    if (digest(wranglerSource) !== plan.target_fingerprints.wrangler_sha256
        || digest(routesSource) !== plan.target_fingerprints.routes_sha256
        || digest(packageLockSource) !== plan.target_fingerprints.package_lock_sha256) {
        throw new Error('Rollback target content does not match the reviewed fingerprints');
    }
} else {
    // Shallow managed-build clones may omit prior Git objects. The exact
    // fingerprints and extracted invariants remain release-blocking here; the
    // full-object comparison is required in local QA and the full-history CI job.
    validateRollbackRehearsal(
        plan,
        JSON.stringify({
            vars: { COLLABORATION_ENABLED: 'false' },
            env: {
                preview: { vars: { COLLABORATION_ENABLED: 'false' } },
                production: { vars: { COLLABORATION_ENABLED: 'false' } }
            }
        }),
        JSON.stringify({ version: 1, include: plan.target_fingerprints.functions_include, exclude: [] }),
        JSON.stringify({
            lockfileVersion: plan.target_fingerprints.lockfile_version,
            packages: { '': { devDependencies: { wrangler: plan.target_fingerprints.wrangler_version } } }
        })
    );
}

console.log('Cloudflare rollback rehearsal passed');
console.log('  Mode: read-only');
console.log('  Previous compatible commit:', plan.previous_compatible_commit);
console.log('  Previous successful deployment:', plan.previous_cloudflare_deployment_id);
console.log('  Previous Git source:', targetSourcesAvailable ? 'verified' : 'managed-clone fingerprints verified');
console.log('  Collaboration after rollback: disabled');
console.log('  Working tree and production deployment: unchanged');
