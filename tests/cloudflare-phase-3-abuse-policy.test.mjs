import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ABUSE_EVIDENCE, ABUSE_SOURCES, validatePhase3AbusePolicy } from '../scripts/cloudflare-phase-3-abuse-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function input() {
    const manifest = json('config/cloudflare/phase-3-abuse-observability.json');
    return { manifest, sprintManifest: json('config/cloudflare/phase-3-sprint-plan.json'),
        sourceFiles: Object.fromEntries(ABUSE_SOURCES.map(file => [file, read(file)])),
        workersTestSource: read(manifest.workers_test_file), routeSource: read('functions/api/v1/[[path]].ts'),
        wrangler: json('wrangler.jsonc'), migrationManifest: json('migrations/manifest.json'),
        migrationSource: read(`migrations/collaboration/${manifest.migration}`),
        evidenceSources: Object.fromEntries(ABUSE_EVIDENCE.map(id => [id,
            read(`docs/collaboration-foundation/evidence/phase-3/${id}.md`)])) };
}

test('CF-P3-007 locks abuse, observability, resilience, and activation boundaries', () => {
    assert.equal(validatePhase3AbusePolicy(input()), true);
});

test('CF-P3-007 rejects weakened limits, logs, provider budgets, and migration authority', () => {
    for (const mutate of [
        value => { value.manifest.rate_limits.oauth_source.limit = 21; },
        value => { value.manifest.observability.fields.push('ip'); },
        value => { value.manifest.provider_resilience.token_exchange_retries = 1; },
        value => { value.migrationManifest.entries[9].gate = 'P3-G4'; }
    ]) { const value = input(); mutate(value); assert.throws(() => validatePhase3AbusePolicy(value)); }
});

test('CF-P3-007 rejects activation, binding, route, evidence, and remote-write drift', () => {
    for (const mutate of [
        value => { value.routeSource += '\nenforceIdentityRateLimit();'; },
        value => { value.wrangler.env.preview.ratelimits = [{ name: 'AUTH_BURST_LIMITER' }]; },
        value => { delete value.evidenceSources['CF-EV-P3-SEC-007']; },
        value => { value.manifest.scope.preview_identity_enabled = true; },
        value => { value.manifest.next_decision.remote_changes_authorized = true; }
    ]) { const value = input(); mutate(value); assert.throws(() => validatePhase3AbusePolicy(value)); }
});
