import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    parseWranglerConfig,
    validateDashboardToWranglerDiff,
    validateGeneratedWorkerTypes,
    validateWranglerConfig
} from '../scripts/cloudflare-wrangler-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parsed = parseWranglerConfig(path.join(root, 'wrangler.jsonc'));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'config/cloudflare/pages-project-baseline.json'), 'utf8'));
const transition = JSON.parse(fs.readFileSync(path.join(root, 'config/cloudflare/pages-wrangler-diff.json'), 'utf8'));
const clone = (value) => structuredClone(value);

test('Pages Wrangler config locks source, output, compatibility, environments, and disabled collaboration', () => {
    assert.equal(validateWranglerConfig(parsed.config, parsed.source), true);
});

test('Pages Wrangler config fails closed for missing, malformed, or enabled collaboration values', () => {
    for (const value of [undefined, false, true, 'true', 'FALSE', '0']) {
        const config = clone(parsed.config);
        if (value === undefined) delete config.env.production.vars.COLLABORATION_ENABLED;
        else config.env.production.vars.COLLABORATION_ENABLED = value;
        assert.throws(() => validateWranglerConfig(config, JSON.stringify(config)));
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

test('dashboard-to-Wrangler transition is explicit, approved, and contains no remote binding', () => {
    assert.equal(validateDashboardToWranglerDiff(parsed.config, baseline, transition), true);
});
