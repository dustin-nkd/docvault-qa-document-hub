import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectCloudflareToolchainState, validateCloudflareToolchainState } from './cloudflare-toolchain-policy.mjs';
import { parseWranglerConfig, validateBurstWorkerConfig, validateGeneratedBurstWorkerTypes,
    validateWranglerConfig } from './cloudflare-wrangler-policy.mjs';
import { validateCompiledWorkerArtifact, validateProductionSourceGraph } from './cloudflare-production-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = collectCloudflareToolchainState(root);
const wranglerBin = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
const typescriptBin = path.join(root, 'node_modules/typescript/bin/tsc');
const vitestBin = path.join(root, 'node_modules/vitest/vitest.mjs');
// Every file holding a wall-clock latency budget. These run isolated so CPU
// contention cannot corrupt the measurement (see the `test` command below).
const LATENCY_TEST_FILES = Object.freeze([
    'tests/cloudflare/preview-api-integration.workers.test.ts',
    'tests/cloudflare/preview-key-foundation.workers.test.ts'
]);
const configPath = path.join(root, 'wrangler.jsonc');
const burstConfigPath = path.join(root, 'wrangler.identity-burst.jsonc');
const burstTypesPath = path.join(root, 'workers/identity-burst-configuration.d.ts');
const functionsPath = path.join(root, 'functions');

const runNodeTool = (entrypoint, args) => {
    const result = spawnSync(process.execPath, [entrypoint, ...args], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
};

const requireFoundationFiles = () => {
    if (!fs.existsSync(configPath)) throw new Error('wrangler.jsonc is not available until CF-P1-003');
    if (!fs.existsSync(functionsPath)) throw new Error('Pages Functions are not available until CF-P1-004');
};

const validateConfig = () => {
    if (!fs.existsSync(configPath)) {
        console.log('Cloudflare configuration gate armed: wrangler.jsonc is intentionally deferred to CF-P1-003');
        return;
    }
    const { config, source } = parseWranglerConfig(configPath);
    validateWranglerConfig(config, source, state.toolchain.compatibility_date);
    console.log('Cloudflare Wrangler configuration policy passed');
    console.log('  Environments: local, preview, production');
    // D-P7-01, approved 2026-07-26: preview activates, production never does.
    // Reported from the parsed config so this line cannot go stale against it.
    console.log('  Collaboration: ' + [['local', config.vars], ['preview', config.env?.preview?.vars], ['production', config.env?.production?.vars]]
        .map(([environment, vars]) => `${environment}=${vars?.COLLABORATION_ENABLED}`).join(', '));
    console.log('  Preview D1: one approved binding; production bindings: none');
};

const validateBurstConfig = () => {
    const { config, source } = parseWranglerConfig(burstConfigPath);
    validateBurstWorkerConfig(config, source, state.toolchain.compatibility_date);
    console.log('Preview burst-limiter Worker configuration policy passed');
};

const command = process.argv[2];
validateCloudflareToolchainState(state);

if (command === 'toolchain-check') {
    const version = execFileSync(process.execPath, [wranglerBin, '--version'], { cwd: root, encoding: 'utf8' }).trim();
    if (version !== state.toolchain.packages.wrangler) throw new Error(`Local Wrangler version drifted: ${version}`);
    console.log('Cloudflare toolchain policy passed');
    console.log(`  Wrangler: ${version} (local node_modules)`);
    console.log(`  TypeScript: ${state.installed.typescript}`);
    console.log(`  Vitest: ${state.installed.vitest}`);
    console.log(`  Workers pool: ${state.installed['@cloudflare/vitest-pool-workers']}`);
    console.log(`  Node types: ${state.installed['@types/node']}`);
    console.log(`  Compatibility date: ${state.toolchain.compatibility_date}`);
} else if (command === 'config-check') {
    validateConfig();
} else if (command === 'types-generate') {
    validateConfig();
    if (!fs.existsSync(configPath)) process.exit(1);
    runNodeTool(wranglerBin, ['types', 'worker-configuration.d.ts']);
} else if (command === 'types-check') {
    validateConfig();
    if (!fs.existsSync(configPath)) process.exit(1);
    runNodeTool(wranglerBin, ['types', 'worker-configuration.d.ts', '--check']);
} else if (command === 'burst-config-check') {
    validateBurstConfig();
} else if (command === 'burst-types-generate') {
    validateBurstConfig();
    runNodeTool(wranglerBin, ['types', burstTypesPath, '--config', burstConfigPath, '--include-runtime', 'false']);
} else if (command === 'burst-types-check') {
    validateBurstConfig();
    runNodeTool(wranglerBin, ['types', burstTypesPath, '--config', burstConfigPath,
        '--include-runtime', 'false', '--check']);
    validateGeneratedBurstWorkerTypes(fs.readFileSync(burstTypesPath, 'utf8'));
} else if (command === 'burst-build') {
    validateBurstConfig();
    runNodeTool(wranglerBin, ['deploy', '--config', burstConfigPath, '--dry-run', '--outdir', '.wrangler/identity-burst-build']);
} else if (command === 'pages-dev') {
    requireFoundationFiles();
    validateConfig();
    runNodeTool(path.join(root, 'scripts/build-pages.mjs'), []);
    runNodeTool(wranglerBin, ['pages', 'dev', '_site', '--persist-to', '.wrangler/state']);
} else if (command === 'test') {
    if (!fs.existsSync(path.join(root, 'vitest.config.mts'))) throw new Error('Workers Vitest configuration is not available until CF-P1-007');
    runNodeTool(typescriptBin, ['--project', 'tsconfig.workers-tests.json']);
    // CF-P4-007 and CF-P5-007 each assert a wall-clock p95 budget for
    // authenticated reads. Run in the default parallel pass, those measurements
    // compete for CPU with the PBKDF2-600k device-key suites and intermittently
    // fail: steady-state p95 is ~11 ms, but starved runs were observed at 250 ms
    // against a 250 ms budget and at 303 ms against a 300 ms budget. The budgets
    // measure the service, not test-runner scheduling, so the latency files run
    // alone in a second pass instead. The budgets and the tests themselves are
    // unchanged — only the contention is removed. Keep both passes: excluding
    // these files from the first pass would otherwise drop their functional
    // cases from the suite entirely.
    runNodeTool(vitestBin, ['run', '--config', 'vitest.config.mts',
        ...LATENCY_TEST_FILES.flatMap(file => ['--exclude', file])]);
    runNodeTool(vitestBin, ['run', '--config', 'vitest.config.mts', ...LATENCY_TEST_FILES]);
} else if (command === 'functions-build' || command === 'pages-dry-run') {
    requireFoundationFiles();
    validateConfig();
    if (command === 'pages-dry-run') runNodeTool(path.join(root, 'scripts/build-pages.mjs'), []);
    runNodeTool(wranglerBin, [
        'pages', 'functions', 'build', 'functions',
        '--outdir', '.wrangler/functions-build',
        '--build-output-directory', '_site',
        '--metafile', '.wrangler/functions-build/meta.json'
    ]);
    const graph = validateProductionSourceGraph(root);
    validateCompiledWorkerArtifact(path.join(root, '.wrangler/functions-build'));
    console.log('Cloudflare production import and artifact policy passed');
    console.log('  Runtime modules:', graph.length);
    console.log('  Test adapters/selectors: none');
} else {
    throw new Error(`Unknown Cloudflare command: ${command || '<missing>'}`);
}
