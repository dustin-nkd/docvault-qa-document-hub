import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase4CentralRbac } from './cloudflare-phase-4-central-rbac-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase4CentralRbac({
    manifest: json('config/cloudflare/phase-4-central-rbac.json'),
    prerequisite: json('config/cloudflare/phase-4-workspace-bootstrap.json'),
    sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
    workersTestSource: read('tests/cloudflare/central-rbac-policy.workers.test.ts'),
    routeSource: read('functions/api/v1/[[path]].ts'),
    wrangler: json('wrangler.jsonc'),
    migrationManifest: json('migrations/manifest.json'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-4/${id}.md`)]))
});

console.log('Cloudflare Phase 4 central RBAC gate passed');
console.log('  CF-P4-003: PASS; actions: 18; Workers tests: 8');
console.log('  Routes/migrations/bindings/remote writes/activation: zero');
