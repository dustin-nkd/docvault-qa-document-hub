import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, validatePhase5DeviceServices } from '../scripts/cloudflare-phase-5-device-services-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const input = () => {
    const migrationManifest = json('migrations/manifest.json');
    return {
        manifest: json('config/cloudflare/phase-5-device-services.json'),
        sprint: json('config/cloudflare/phase-5-sprint-plan.json'), migrationManifest,
        migrationSource: read(`migrations/collaboration/${migrationManifest.entries[10].filename}`),
        repositorySource: read('functions/_lib/devices/device-repository.ts'),
        serviceSource: read('functions/_lib/devices/device-service.ts'),
        indexSource: read('functions/_lib/devices/index.ts'),
        workersTest: read('tests/cloudflare/device-services.workers.test.ts'),
        routeSource: read('functions/_lib/collaboration/runtime-handler.ts'), wrangler: json('wrangler.jsonc'),
        evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
            read(`docs/collaboration-foundation/evidence/phase-5/${id}.md`)])),
        implementationSource: read('docs/collaboration-foundation/phase-5-device-services.md'),
        contract: json('config/cloudflare/phase-5-contract-freeze.json')
    };
};

// D-P7-01 (owner-approved 2026-07-26, docs/collaboration-foundation/decision-log.md) activates
// COLLABORATION_ENABLED='true' for the PREVIEW environment ONLY. The top-level `vars` default and
// the `production` environment stay 'false'. This gate asserts only
// `wrangler.env.production.vars.COLLABORATION_ENABLED === 'false'`, so preview activation passes
// through while a production flip is still rejected by the case below.

test('CF-P5-004 locks atomic device registration, inventory, revocation, and audit', () => {
    // NO-OP CONTROL: the real, UNMUTATED repository input must validate. If this throws, every
    // assert.throws below would pass for the wrong reason and the suite would prove nothing.
    assert.equal(validatePhase5DeviceServices(input()), true);

    // Pin the preconditions the rejection cases rely on, so that flipping production to 'true' is a
    // real change rather than a no-op, and so the suite cannot be made green by reverting D-P7-01.
    const { wrangler } = input();
    assert.equal(wrangler.env.preview.vars.COLLABORATION_ENABLED, 'true', 'D-P7-01 preview activation');
    assert.equal(wrangler.env.production.vars.COLLABORATION_ENABLED, 'false', 'production stays disabled');
    assert.equal(wrangler.vars.COLLABORATION_ENABLED, 'false', 'default vars stay disabled');
});

test('CF-P5-004 rejects private-key paths, migration drift, route activation, and evidence loss', () => {
    for (const [name, mutate] of [
        ['private key', value => { value.serviceSource += '\nconst private_jwk = {};'; }],
        ['migration', value => { value.migrationManifest.entries[10].gate = 'P5-G2A'; }],
        ['rotation sequence', value => { value.contract.rotation_schema.planned_sequence = 11; }],
        ['route', value => { value.routeSource += "\nimport '../devices';"; }],
        // D-P7-01: preview may now legitimately be 'true', so the activation-boundary proof lives on
        // production -- the environment this gate actually asserts. Kept targeted here, never deleted.
        ['production', value => { value.wrangler.env.production.vars.COLLABORATION_ENABLED = 'true'; }],
        ['evidence', value => { delete value.evidenceSources['CF-EV-P5-SEC-004']; }]
    ]) {
        const value = input(); mutate(value);
        assert.throws(() => validatePhase5DeviceServices(value), undefined, name);
    }
});