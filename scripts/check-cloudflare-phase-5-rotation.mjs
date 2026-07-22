import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, validatePhase5Rotation } from './cloudflare-phase-5-rotation-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const manifest = json('config/cloudflare/phase-5-rotation-recovery.json');
validatePhase5Rotation({ manifest, sprint: json('config/cloudflare/phase-5-sprint-plan.json'),
    contract: json('config/cloudflare/phase-5-contract-freeze.json'),
    migrationManifest: json('migrations/manifest.json'),
    migrationSource: read(`migrations/collaboration/${manifest.schema.filename}`),
    serviceSource: read('functions/_lib/workspace-keys/rotation-service.ts'),
    indexSource: read('functions/_lib/workspace-keys/index.ts'),
    workersTest: read('tests/cloudflare/workspace-key-rotation.workers.test.ts'),
    routeSource: read('functions/_lib/collaboration/runtime-handler.ts'), wrangler: json('wrangler.jsonc'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-5/${id}.md`)])),
    implementationSource: read('docs/collaboration-foundation/phase-5-rotation-recovery.md') });
console.log('Cloudflare CF-P5-006 monotonic rotation and no-escrow recovery gate passed');
console.log('  Rotation is current+1, immutable-snapshot, database-guarded, resumable, and idempotent');
console.log('  Remote D1, routes, bindings, secrets, Preview deploy, and production remain unchanged');
