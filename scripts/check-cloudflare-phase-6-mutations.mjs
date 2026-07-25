import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Mutations } from './cloudflare-phase-6-mutations-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-6');
const MUTATION_EVIDENCE = ['CF-EV-P6-UT-003', 'CF-EV-P6-INT-001', 'CF-EV-P6-SEC-004', 'CF-EV-P6-QA-002'];

validatePhase6Mutations({
    manifest: json('config/cloudflare/phase-6-document-mutations.json'),
    serviceSource: read('functions/_lib/documents/document-service.ts'),
    recipeSource: read('functions/_lib/persistence/mutation-recipes.ts'),
    registrySource: read('functions/_lib/audit/event-registry.ts'),
    integrationTestSource: read('tests/cloudflare/document-mutations.workers.test.ts'),
    contractFreeze: json('config/cloudflare/phase-6-contract-freeze.json'),
    migrationManifest: json('migrations/manifest.json'),
    evidenceSources: Object.fromEntries(MUTATION_EVIDENCE
        .map(id => [id, fs.readFileSync(path.join(evidenceDirectory, `${id}.md`), 'utf8')]))
});

console.log('Cloudflare Phase 6 document mutations passed');
console.log('  CF-P6-004: PASS; P6-G2B authorizes CF-P6-005 only');
console.log('  Sprint gates proven at the persistence layer: G3 (Viewer denied), G4 (conflict), G5 (retry)');
console.log('  Append-only revisions, 30-day idempotency, zero migrations, zero routes');
