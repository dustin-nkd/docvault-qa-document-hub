import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    parseWranglerConfig,
    validateBurstWorkerConfig,
    validateGeneratedBurstWorkerTypes,
    validateDashboardToWranglerDiff,
    validateGeneratedWorkerTypes,
    validateWranglerConfig
} from '../scripts/cloudflare-wrangler-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parsed = parseWranglerConfig(path.join(root, 'wrangler.jsonc'));
const burst = parseWranglerConfig(path.join(root, 'wrangler.identity-burst.jsonc'));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'config/cloudflare/pages-project-baseline.json'), 'utf8'));
const transition = JSON.parse(fs.readFileSync(path.join(root, 'config/cloudflare/pages-wrangler-diff.json'), 'utf8'));
const clone = (value) => structuredClone(value);

// NO-OP CONTROL for every assert.throws in this file.
// D-P7-01 (approved 2026-07-26, decision-log.md) turned COLLABORATION_ENABLED on for the
// PREVIEW environment only. That makes the real wrangler.jsonc an input any un-migrated gate
// would reject on its own, so if this control ever throws, the UNMUTATED config already fails
// and every rejection case below would pass for the wrong reason — the suite would be vacuous
// and would prove nothing about the production boundary. Keep this test first and passing.
test('Pages Wrangler config locks source, output, compatibility, environments, and the D-P7-01 collaboration boundary', () => {
    assert.equal(validateWranglerConfig(parsed.config, parsed.source), true);
    // Same no-op through the exact harness the rejection loops use (clone + stringified
    // source), so a green assert.throws below can only come from the mutation itself.
    assert.equal(validateWranglerConfig(clone(parsed.config), JSON.stringify(parsed.config)), true);
    // The boundary D-P7-01 drew: preview activated, default vars and production still off.
    assert.equal(parsed.config.env.preview.vars.COLLABORATION_ENABLED, 'true');
    assert.equal(parsed.config.vars.COLLABORATION_ENABLED, 'false');
    assert.equal(parsed.config.env.production.vars.COLLABORATION_ENABLED, 'false');
});

test('Pages Wrangler config fails closed for missing, malformed, or enabled collaboration values', () => {
    // D-P7-01 authorized collaboration for PREVIEW only. These cases are the surviving proof
    // that the two scopes it did NOT authorize — the production environment and the top-level
    // default vars — still reject activation ('true'), type confusion (true/false booleans),
    // casing drift ('FALSE'), truthiness games ('0'), and an omitted value.
    for (const [scope, varsOf] of [
        ['env.production.vars', (config) => config.env.production.vars],
        ['vars (default)', (config) => config.vars]
    ]) {
        for (const value of [undefined, false, true, 'true', 'FALSE', '0']) {
            const config = clone(parsed.config);
            const vars = varsOf(config);
            if (value === undefined) delete vars.COLLABORATION_ENABLED;
            else vars.COLLABORATION_ENABLED = value;
            assert.throws(() => validateWranglerConfig(config, JSON.stringify(config)),
                `${scope}.COLLABORATION_ENABLED=${String(value)} must be rejected under D-P7-01`);
        }
    }
});

test('Pages Wrangler config rejects environment crossover and incomplete non-inheritable vars', () => {
    for (const mutate of [
        (config) => { config.env.preview.vars.APP_ENV = 'production'; },
        (config) => { config.env.preview.vars.ORIGIN_POLICY_MODE = 'production'; },
        (config) => { delete config.env.preview.vars.CANONICAL_PRODUCTION_ORIGIN; },
        (config) => { config.env.staging = { vars: config.env.preview.vars }; }
    ]) {
        const config = clone(parsed.config);
        mutate(config);
        assert.throws(() => validateWranglerConfig(config, JSON.stringify(config)));
    }
});

test('Pages Wrangler config rejects remote bindings, resource identifiers, and placeholders', () => {
    for (const [key, value] of [
        ['d1_databases', []],
        ['account_id', 'not-allowed'],
        ['database_id', '11111111-1111-4111-8111-111111111111'],
        ['secret', '<PLACEHOLDER>']
    ]) {
        const config = clone(parsed.config);
        config[key] = value;
        assert.throws(() => validateWranglerConfig(config, JSON.stringify(config)));
    }
});

test('Wrangler-generated Env types contain reviewed variables and preview D1 only', () => {
    const generated = fs.readFileSync(path.join(root, 'worker-configuration.d.ts'), 'utf8');
    assert.equal(validateGeneratedWorkerTypes(generated), true);
});

test('Preview burst Worker locks its private route boundary and generated RateLimit binding', () => {
    assert.equal(validateBurstWorkerConfig(burst.config, burst.source), true);
    assert.equal(validateGeneratedBurstWorkerTypes(
        fs.readFileSync(path.join(root, 'workers/identity-burst-configuration.d.ts'), 'utf8')), true);
});

test('Preview burst Worker rejects public exposure, authority drift, and extra bindings', () => {
    for (const mutate of [
        (config) => { config.workers_dev = true; },
        (config) => { config.routes = ['example.com/*']; },
        (config) => { config.observability.head_sampling_rate = 0.1; },
        (config) => { config.ratelimits[0].simple.limit = 7; },
        (config) => { config.vars = { UNSAFE: 'value' }; }
    ]) {
        const config = clone(burst.config);
        mutate(config);
        assert.throws(() => validateBurstWorkerConfig(config, JSON.stringify(config)));
    }
});

test('dashboard-to-Wrangler transition is explicit, approved, and contains no remote binding', () => {
    assert.equal(validateDashboardToWranglerDiff(parsed.config, baseline, transition), true);
});
