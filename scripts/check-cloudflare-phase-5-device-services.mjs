import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, validatePhase5DeviceServices } from './cloudflare-phase-5-device-services-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const migrations = json('migrations/manifest.json');
const entry = migrations.entries[10];
validatePhase5DeviceServices({
    manifest: json('config/cloudflare/phase-5-device-services.json'),
    sprint: json('config/cloudflare/phase-5-sprint-plan.json'), migrationManifest: migrations,
    migrationSource: read(`migrations/collaboration/${entry.filename}`),
    repositorySource: read('functions/_lib/devices/device-repository.ts'),
    serviceSource: read('functions/_lib/devices/device-service.ts'),
    indexSource: read('functions/_lib/devices/index.ts'),
    workersTest: read('tests/cloudflare/device-services.workers.test.ts'),
    routeSource: read('functions/_lib/collaboration/runtime-handler.ts'), wrangler: json('wrangler.jsonc'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-5/${id}.md`)])),
    implementationSource: read('docs/collaboration-foundation/phase-5-device-services.md'),
    contract: json('config/cloudflare/phase-5-contract-freeze.json')
});
console.log('Cloudflare CF-P5-004 device services gate passed');
console.log('  Registration, own inventory, revocation, idempotency, and device audit are atomic');
console.log('  Migration 11 is local-only; rotation migration 12 is now local-only; routes and remote D1 unchanged');
