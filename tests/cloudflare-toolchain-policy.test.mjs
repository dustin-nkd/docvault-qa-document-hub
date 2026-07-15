import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    collectCloudflareToolchainState,
    validateCloudflareToolchainState
} from '../scripts/cloudflare-toolchain-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const actual = collectCloudflareToolchainState(root);
const clone = (value) => structuredClone(value);

test('Cloudflare toolchain locks compatible local versions, commands, date, and quarterly owner', () => {
    assert.equal(validateCloudflareToolchainState(actual), true);
});

test('Cloudflare toolchain rejects version ranges, lock drift, and installed drift', () => {
    for (const mutate of [
        (state) => { state.packageJson.devDependencies.wrangler = '^4.111.0'; },
        (state) => { state.packageLock.packages['node_modules/typescript'].version = '7.0.1'; },
        (state) => { state.installed.vitest = '4.1.9'; }
    ]) {
        const state = clone(actual);
        mutate(state);
        assert.throws(() => validateCloudflareToolchainState(state));
    }
});

test('Cloudflare toolchain rejects runtime downloads and command drift', () => {
    for (const mutate of [
        (state) => { state.packageJson.scripts['cf:types:check'] = 'npx wrangler@latest types --check'; },
        (state) => { state.packageJson.scripts['cf:pages:dev'] = 'wrangler pages dev dist'; },
        (state) => { state.workflow = state.workflow.replace('npm ci', 'npm install'); }
    ]) {
        const state = clone(actual);
        mutate(state);
        assert.throws(() => validateCloudflareToolchainState(state));
    }
});

test('Cloudflare toolchain rejects floating actions and environment policy drift', () => {
    for (const mutate of [
        (state) => { state.workflow = state.workflow.replace(/actions\/checkout@[0-9a-f]{40}/, 'actions/checkout@v6'); },
        (state) => { state.toolchain.compatibility_date = '2026-07-16'; },
        (state) => { state.toolchain.next_quarterly_review = '2026-11-15'; }
    ]) {
        const state = clone(actual);
        mutate(state);
        assert.throws(() => validateCloudflareToolchainState(state));
    }
});
