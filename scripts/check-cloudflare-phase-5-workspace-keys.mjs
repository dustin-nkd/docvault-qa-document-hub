import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, validatePhase5WorkspaceKeys } from './cloudflare-phase-5-workspace-keys-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
validatePhase5WorkspaceKeys({
    manifest: json('config/cloudflare/phase-5-workspace-keys.json'),
    sprint: json('config/cloudflare/phase-5-sprint-plan.json'),
    migrationManifest: json('migrations/manifest.json'),
    serviceSource: read('functions/_lib/workspace-keys/workspace-key-service.ts'),
    indexSource: read('functions/_lib/workspace-keys/index.ts'),
    primitivesSource: read('functions/_lib/e2ee/primitives.ts'),
    workersTest: read('tests/cloudflare/workspace-key-services.workers.test.ts'),
    routeSource: read('functions/_lib/collaboration/runtime-handler.ts'),
    wrangler: json('wrangler.jsonc'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-5/${id}.md`)])),
    implementationSource: read('docs/collaboration-foundation/phase-5-workspace-keys.md')
});
console.log('Cloudflare CF-P5-005 workspace keys gate passed');
console.log('  Stateless bootstrap, atomic initial envelope, and server-derived readiness are enforced');
console.log('  Migration 12 is a later local-only story; routes, remote D1, bindings, secrets, and production remain unchanged');
