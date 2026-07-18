import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    validateDeploymentArtifact,
    validatePagesRoutesDocument
} from '../scripts/cloudflare-deployment-boundary-policy.mjs';
import { validateCloudflareCiBoundary } from '../scripts/cloudflare-ci-policy.mjs';
import {
    rollbackTargetSourcesAvailable,
    validateRollbackRehearsal
} from '../scripts/cloudflare-rollback-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createArtifact() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'docvault-artifact-'));
    fs.writeFileSync(path.join(directory, '.nojekyll'), '');
    fs.writeFileSync(path.join(directory, '_headers'), '/\n  X-Content-Type-Options: nosniff\n');
    fs.writeFileSync(path.join(directory, '_routes.json'), JSON.stringify({
        version: 1,
        include: ['/api/v1/*'],
        exclude: []
    }));
    fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><title>DocVault</title>');
    return directory;
}

test('deployment artifact allowlist accepts runtime assets and emits hashes', () => {
    const directory = createArtifact();
    try {
        const manifest = validateDeploymentArtifact(directory);
        assert.equal(manifest.schema_version, 1);
        assert.equal(manifest.files.length, 4);
        assert.ok(manifest.files.every(file => /^[0-9a-f]{64}$/.test(file.sha256)));
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('deployment artifact rejects server, test, evidence, local D1, secret, and route leaks', () => {
    const cases = [
        ['functions/api.ts', 'export default {}'],
        ['tests/fixture.js', 'fixture'],
        ['docs/evidence.md', 'evidence'],
        ['migrations/local.sql', 'CREATE TABLE leaked (id TEXT)'],
        ['js/secret.js', 'const value = "CLOUDFLARE_API_TOKEN";']
    ];
    for (const [relativePath, source] of cases) {
        const directory = createArtifact();
        try {
            const target = path.join(directory, ...relativePath.split('/'));
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, source);
            assert.throws(() => validateDeploymentArtifact(directory), /protected|non-runtime/);
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    }
    assert.throws(() => validatePagesRoutesDocument({
        version: 1,
        include: ['/*'],
        exclude: []
    }), /only for \/api\/v1/);
});

test('CI blocks deployment until all Cloudflare, artifact, and browser gates pass', () => {
    const packageJson = JSON.parse(read('package.json'));
    const workflow = read('.github/workflows/deploy.yml');
    assert.equal(validateCloudflareCiBoundary(packageJson, workflow), true);
    const withoutWorkersTests = structuredClone(packageJson);
    withoutWorkersTests.scripts['check:cloudflare'] = withoutWorkersTests.scripts['check:cloudflare']
        .replace(' && npm run cf:test', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutWorkersTests, workflow));
    const withoutPhase2Schema = structuredClone(packageJson);
    withoutPhase2Schema.scripts['check:cloudflare'] = withoutPhase2Schema.scripts['check:cloudflare']
        .replace(' && npm run cf:phase2:schema:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase2Schema, workflow));
    const withoutPhase2Migrations = structuredClone(packageJson);
    withoutPhase2Migrations.scripts['check:cloudflare'] = withoutPhase2Migrations.scripts['check:cloudflare']
        .replace(' && npm run cf:phase2:migrations:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase2Migrations, workflow));
    const withoutPhase2Readiness = structuredClone(packageJson);
    withoutPhase2Readiness.scripts['check:cloudflare'] = withoutPhase2Readiness.scripts['check:cloudflare']
        .replace(' && npm run cf:phase2:readiness:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase2Readiness, workflow));
    const withoutPhase2Persistence = structuredClone(packageJson);
    withoutPhase2Persistence.scripts['check:cloudflare'] = withoutPhase2Persistence.scripts['check:cloudflare']
        .replace(' && npm run cf:phase2:persistence:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase2Persistence, workflow));
    const withoutPhase2Recipes = structuredClone(packageJson);
    withoutPhase2Recipes.scripts['check:cloudflare'] = withoutPhase2Recipes.scripts['check:cloudflare']
        .replace(' && npm run cf:phase2:recipes:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase2Recipes, workflow));
    const withoutPhase2Quality = structuredClone(packageJson);
    withoutPhase2Quality.scripts['check:cloudflare'] = withoutPhase2Quality.scripts['check:cloudflare']
        .replace(' && npm run cf:phase2:quality:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase2Quality, workflow));
    const withoutPhase2Preview = structuredClone(packageJson);
    withoutPhase2Preview.scripts['check:cloudflare'] = withoutPhase2Preview.scripts['check:cloudflare']
        .replace(' && npm run cf:phase2:preview:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase2Preview, workflow));
    const withoutPhase3Sprint = structuredClone(packageJson);
    withoutPhase3Sprint.scripts['check:cloudflare'] = withoutPhase3Sprint.scripts['check:cloudflare']
        .replace(' && npm run cf:phase3:sprint:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase3Sprint, workflow));
    const withoutPhase3Contract = structuredClone(packageJson);
    withoutPhase3Contract.scripts['check:cloudflare'] = withoutPhase3Contract.scripts['check:cloudflare']
        .replace(' && npm run cf:phase3:contract:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase3Contract, workflow));
    const withoutPhase3Primitives = structuredClone(packageJson);
    withoutPhase3Primitives.scripts['check:cloudflare'] = withoutPhase3Primitives.scripts['check:cloudflare']
        .replace(' && npm run cf:phase3:primitives:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase3Primitives, workflow));
    const withoutPhase3OAuth = structuredClone(packageJson);
    withoutPhase3OAuth.scripts['check:cloudflare'] = withoutPhase3OAuth.scripts['check:cloudflare']
        .replace(' && npm run cf:phase3:oauth:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase3OAuth, workflow));
    const withoutPhase3Callback = structuredClone(packageJson);
    withoutPhase3Callback.scripts['check:cloudflare'] = withoutPhase3Callback.scripts['check:cloudflare']
        .replace(' && npm run cf:phase3:callback:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase3Callback, workflow));
    const withoutPhase3Session = structuredClone(packageJson);
    withoutPhase3Session.scripts['check:cloudflare'] = withoutPhase3Session.scripts['check:cloudflare']
        .replace(' && npm run cf:phase3:session:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase3Session, workflow));
    const withoutPhase4Contract = structuredClone(packageJson);
    withoutPhase4Contract.scripts['check:cloudflare'] = withoutPhase4Contract.scripts['check:cloudflare']
        .replace(' && npm run cf:phase4:contract:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase4Contract, workflow));
    const withoutPhase4Workspace = structuredClone(packageJson);
    withoutPhase4Workspace.scripts['check:cloudflare'] = withoutPhase4Workspace.scripts['check:cloudflare']
        .replace(' && npm run cf:phase4:workspace:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase4Workspace, workflow));
    const withoutPhase4Rbac = structuredClone(packageJson);
    withoutPhase4Rbac.scripts['check:cloudflare'] = withoutPhase4Rbac.scripts['check:cloudflare']
        .replace(' && npm run cf:phase4:rbac:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase4Rbac, workflow));
    const withoutPhase4Invitations = structuredClone(packageJson);
    withoutPhase4Invitations.scripts['check:cloudflare'] = withoutPhase4Invitations.scripts['check:cloudflare']
        .replace(' && npm run cf:phase4:invitations:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase4Invitations, workflow));
    const withoutPhase4Memberships = structuredClone(packageJson);
    withoutPhase4Memberships.scripts['check:cloudflare'] = withoutPhase4Memberships.scripts['check:cloudflare']
        .replace(' && npm run cf:phase4:memberships:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase4Memberships, workflow));
    const withoutPhase4Audit = structuredClone(packageJson);
    withoutPhase4Audit.scripts['check:cloudflare'] = withoutPhase4Audit.scripts['check:cloudflare']
        .replace(' && npm run cf:phase4:audit:check', '');
    assert.throws(() => validateCloudflareCiBoundary(withoutPhase4Audit, workflow));
    assert.throws(() => validateCloudflareCiBoundary(packageJson,
        workflow.replace('run: npm run check:deployment-boundary', 'run: npm run test:e2e')));
});

test('rollback rehearsal selects a locked, disabled, API-isolated compatible commit', () => {
    const plan = JSON.parse(read('config/cloudflare/rollback-rehearsal.json'));
    const wranglerSource = JSON.stringify({
        vars: { COLLABORATION_ENABLED: 'false' },
        env: {
            preview: { vars: { COLLABORATION_ENABLED: 'false' } },
            production: { vars: { COLLABORATION_ENABLED: 'false' } }
        }
    });
    const routesSource = JSON.stringify({
        version: 1,
        include: plan.target_fingerprints.functions_include,
        exclude: []
    });
    const packageLockSource = JSON.stringify({
        lockfileVersion: plan.target_fingerprints.lockfile_version,
        packages: { '': { devDependencies: { wrangler: plan.target_fingerprints.wrangler_version } } }
    });
    assert.equal(validateRollbackRehearsal(
        plan,
        wranglerSource,
        routesSource,
        packageLockSource
    ), true);
    assert.throws(() => validateRollbackRehearsal(
        { ...plan, mode: 'execute' },
        wranglerSource,
        routesSource,
        packageLockSource
    ), /non-destructive/);
});

test('rollback rehearsal uses fingerprints when a managed clone omits a target path', () => {
    const commit = 'a'.repeat(40);
    const paths = ['wrangler.jsonc', '_routes.json', 'package-lock.json'];
    const available = new Set([
        `${commit}^{commit}`,
        `${commit}:_routes.json`,
        `${commit}:package-lock.json`
    ]);
    assert.equal(rollbackTargetSourcesAvailable(value => available.has(value), commit, paths), false);
    available.add(`${commit}:wrangler.jsonc`);
    assert.equal(rollbackTargetSourcesAvailable(value => available.has(value), commit, paths), true);
});
