import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { collectCloudflareToolchainState, validateCloudflareToolchainState } from './cloudflare-toolchain-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = collectCloudflareToolchainState(root);
const wranglerBin = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
const vitestBin = path.join(root, 'node_modules/vitest/vitest.mjs');
const configPath = path.join(root, 'wrangler.jsonc');
const generatedTypesPath = path.join(root, 'worker-configuration.d.ts');
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

const readWranglerConfig = () => {
    if (!fs.existsSync(configPath)) return null;
    const parsed = ts.parseConfigFileTextToJson(configPath, fs.readFileSync(configPath, 'utf8'));
    if (parsed.error) throw new Error('wrangler.jsonc is not valid JSONC');
    return parsed.config;
};

const validateConfig = () => {
    const config = readWranglerConfig();
    if (!config) {
        console.log('Cloudflare configuration gate armed: wrangler.jsonc is intentionally deferred to CF-P1-003');
        return;
    }
    if (config.name !== 'docvault-qa-document-hub') throw new Error('Wrangler project name drifted');
    if (config.pages_build_output_dir !== './_site') throw new Error('Wrangler Pages output must remain ./_site');
    if (config.compatibility_date !== state.toolchain.compatibility_date) throw new Error('Wrangler compatibility date drifted');
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
    console.log(`  Compatibility date: ${state.toolchain.compatibility_date}`);
} else if (command === 'config-check') {
    validateConfig();
} else if (command === 'types-generate') {
    validateConfig();
    if (!fs.existsSync(configPath)) process.exit(1);
    runNodeTool(wranglerBin, ['types', generatedTypesPath]);
} else if (command === 'types-check') {
    validateConfig();
    if (!fs.existsSync(configPath)) process.exit(1);
    runNodeTool(wranglerBin, ['types', generatedTypesPath, '--check']);
} else if (command === 'pages-dev') {
    requireFoundationFiles();
    validateConfig();
    runNodeTool(path.join(root, 'scripts/build-pages.mjs'), []);
    runNodeTool(wranglerBin, ['pages', 'dev', '_site', '--persist-to', '.wrangler/state']);
} else if (command === 'test') {
    if (!fs.existsSync(path.join(root, 'vitest.config.mts'))) throw new Error('Workers Vitest configuration is not available until CF-P1-007');
    runNodeTool(vitestBin, ['run', '--config', 'vitest.config.mts']);
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
} else {
    throw new Error(`Unknown Cloudflare command: ${command || '<missing>'}`);
}
