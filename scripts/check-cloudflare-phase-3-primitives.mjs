import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, validatePhase3IdentityPrimitives } from './cloudflare-phase-3-primitives-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceIds = ['CF-EV-P3-UT-001', 'CF-EV-P3-SEC-002'];

validatePhase3IdentityPrimitives({
    manifest: json('config/cloudflare/phase-3-identity-primitives.json'),
    sprintManifest: json('config/cloudflare/phase-3-sprint-plan.json'),
    sprintSource: read('docs/collaboration-foundation/phase-3-sprint.md'),
    contractSource: read('docs/collaboration-foundation/phase-3-identity-session-contract.md'),
    sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
    workersTestSource: read('tests/cloudflare/identity-primitives.workers.test.ts'),
    routeSource: read('functions/api/v1/[[path]].ts'),
    wrangler: json('wrangler.jsonc'),
    migrationManifest: json('migrations/manifest.json'),
    evidenceSources: Object.fromEntries(evidenceIds.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-3/${id}.md`)]))
});

console.log('Cloudflare Phase 3 identity primitives gate passed');
console.log('  CF-P3-002: PASS; Workers tests: 10; evidence: UT-001 and SEC-002');
console.log('  Route/schema/binding/secret/remote changes: zero');
console.log('  Historical primitive gate preserved; CF-P3-007 now PASS');
