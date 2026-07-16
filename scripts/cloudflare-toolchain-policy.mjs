import fs from 'node:fs';
import path from 'node:path';

export const cloudflareScripts = {
    'cf:toolchain:check': 'node scripts/cloudflare-command.mjs toolchain-check',
    'cf:config:check': 'node scripts/cloudflare-command.mjs config-check',
    'cf:types:generate': 'node scripts/cloudflare-command.mjs types-generate',
    'cf:types:check': 'node scripts/cloudflare-command.mjs types-check',
    'cf:pages:dev': 'node scripts/cloudflare-command.mjs pages-dev',
    'cf:test': 'node scripts/cloudflare-command.mjs test',
    'cf:rollback:rehearse': 'node scripts/rehearse-cloudflare-rollback.mjs',
    'cf:functions:build': 'node scripts/cloudflare-command.mjs functions-build',
    'cf:pages:dry-run': 'node scripts/cloudflare-command.mjs pages-dry-run',
    'cf:phase1:check': 'node scripts/check-cloudflare-phase-1-exit.mjs',
    'cf:phase2:schema:check': 'node scripts/check-cloudflare-phase-2-schema.mjs',
    'cf:phase2:migrations:check': 'node scripts/check-cloudflare-phase-2-migrations.mjs',
    'cf:phase2:readiness:check': 'node scripts/check-cloudflare-phase-2-readiness.mjs',
    'cf:phase2:persistence:check': 'node scripts/check-cloudflare-phase-2-persistence.mjs',
    'cf:phase2:recipes:check': 'node scripts/check-cloudflare-phase-2-security-recipes.mjs',
    'cf:phase2:quality:check': 'node scripts/check-cloudflare-phase-2-quality-matrix.mjs',
    'cf:phase2:preview:check': 'node scripts/check-cloudflare-phase-2-preview-d1.mjs',
    'cf:phase2:recovery:check': 'node scripts/check-cloudflare-phase-2-recovery.mjs',
    'cf:phase2:exit:check': 'node scripts/check-cloudflare-phase-2-exit.mjs',
    'cf:phase3:sprint:check': 'node scripts/check-cloudflare-phase-3-sprint.mjs',
    'cf:phase3:contract:check': 'node scripts/check-cloudflare-phase-3-contract.mjs'
};

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export function collectCloudflareToolchainState(root) {
    const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
    const toolchain = readJson('config/cloudflare/toolchain.json');
    const packageJson = readJson('package.json');
    const packageLock = readJson('package-lock.json');
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
    const installed = Object.fromEntries(Object.keys(toolchain.packages).map((packageName) => [
        packageName,
        readJson(`node_modules/${packageName}/package.json`).version
    ]));
    return { toolchain, packageJson, packageLock, workflow, installed };
}

export function validateCloudflareToolchainState(state) {
    const { toolchain, packageJson, packageLock, workflow, installed } = state;
    assert(toolchain.schema_version === 1, 'Unsupported Cloudflare toolchain policy schema');
    assert(toolchain.node_ci_major === 22, 'Cloudflare CI Node major must remain 22');
    assert(/^\d{4}-\d{2}-\d{2}$/.test(toolchain.compatibility_date), 'Compatibility date must use YYYY-MM-DD');
    assert(toolchain.compatibility_date === '2026-07-15', 'Phase 1 compatibility date drifted');
    assert(toolchain.review_owner === 'Technical Lead and Operations', 'Quarterly review owner drifted');
    assert(toolchain.next_quarterly_review === '2026-10-15', 'Quarterly review date drifted');

    const expectedPackages = {
        wrangler: '4.111.0',
        typescript: '7.0.2',
        vitest: '4.1.10',
        '@cloudflare/vitest-pool-workers': '0.18.5',
        '@types/node': '22.20.1'
    };
    assert(JSON.stringify(toolchain.packages) === JSON.stringify(expectedPackages), 'Cloudflare toolchain package policy drifted');
    const rootLock = packageLock.packages?.['']?.devDependencies || {};
    for (const [packageName, version] of Object.entries(expectedPackages)) {
        assert(packageJson.devDependencies?.[packageName] === version, `${packageName} must use exact version ${version}`);
        assert(rootLock[packageName] === version, `${packageName} lockfile root version drifted`);
        assert(packageLock.packages?.[`node_modules/${packageName}`]?.version === version, `${packageName} resolved lockfile version drifted`);
        assert(installed[packageName] === version, `${packageName} installed version drifted`);
    }
    assert(Number(expectedPackages.wrangler.split('.')[0]) === 4, 'Wrangler must remain on major version 4');

    for (const [scriptName, command] of Object.entries(cloudflareScripts)) {
        assert(packageJson.scripts?.[scriptName] === command, `Cloudflare script drifted: ${scriptName}`);
    }
    const cloudflareCommandText = Object.entries(packageJson.scripts || {})
        .filter(([name]) => name.startsWith('cf:'))
        .map(([, command]) => command)
        .join('\n');
    assert(!/\bnpx\b|\blatest\b|npm\s+(?:install|i)\b/i.test(cloudflareCommandText), 'Cloudflare commands must use locked local binaries');

    assert(/node-version:\s*['"]22['"]/.test(workflow), 'CI must run the pinned Node 22 major');
    assert(/run:\s*npm ci\b/.test(workflow), 'CI must install through npm ci');
    assert(!/run:\s*npm (?:install|i)\b/.test(workflow), 'CI must not use npm install');
    assert(!/\bnpx\s+(?:wrangler|vitest|tsc)\b/i.test(workflow), 'CI must not download Cloudflare toolchain commands');
    assert(/uses:\s*actions\/checkout@[0-9a-f]{40}\s*#\s*v6/.test(workflow), 'Checkout action must be pinned to the reviewed v6 commit');
    assert(/fetch-depth:\s*0/.test(workflow), 'CI checkout must retain rollback verification history');
    assert(/uses:\s*actions\/setup-node@[0-9a-f]{40}\s*#\s*v6/.test(workflow), 'Setup Node action must be pinned to the reviewed v6 commit');
    assert(/uses:\s*peaceiris\/actions-gh-pages@[0-9a-f]{40}\s*#\s*v4/.test(workflow), 'GitHub Pages action must be pinned to the reviewed v4 commit');
    assert(packageJson.scripts?.check === 'npm run check:base && npm run check:cloudflare', 'The release check must include the Cloudflare gate');
    assert(/run:\s*npm run check\b/.test(workflow), 'CI must run the full production and Cloudflare gate');
    assert(/run:\s*npm run check:deployment-boundary\b/.test(workflow), 'CI must inspect the final deployment artifact');
    return true;
}
