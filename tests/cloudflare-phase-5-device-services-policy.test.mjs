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

test('CF-P5-004 locks atomic device registration, inventory, revocation, and audit', () => {
    assert.equal(validatePhase5DeviceServices(input()), true);
});

test('CF-P5-004 rejects private-key paths, migration drift, route activation, and evidence loss', () => {
    for (const [name, mutate] of [
        ['private key', value => { value.serviceSource += '\nconst private_jwk = {};'; }],
        ['migration', value => { value.migrationManifest.entries[10].gate = 'P5-G2A'; }],
        ['rotation sequence', value => { value.contract.rotation_schema.planned_sequence = 11; }],
        ['route', value => { value.routeSource += "\nimport '../devices';"; }],
        ['production', value => { value.wrangler.env.production.vars.COLLABORATION_ENABLED = 'true'; }],
        ['evidence', value => { delete value.evidenceSources['CF-EV-P5-SEC-004']; }]
    ]) {
        const value = input(); mutate(value);
        assert.throws(() => validatePhase5DeviceServices(value), undefined, name);
    }
});