import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase4WorkspaceBootstrap } from './cloudflare-phase-4-workspace-bootstrap-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase4WorkspaceBootstrap({
    manifest: json('config/cloudflare/phase-4-workspace-bootstrap.json'),
    contract: json('config/cloudflare/phase-4-contract-freeze.json'),
    sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
    workersTestSource: read('tests/cloudflare/workspace-bootstrap.workers.test.ts'),
    routeSource: read('functions/api/v1/[[path]].ts'),
    wrangler: json('wrangler.jsonc'),
    migrationManifest: json('migrations/manifest.json'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-4/${id}.md`)]))
});

console.log('Cloudflare Phase 4 atomic workspace bootstrap gate passed');
console.log('  CF-P4-002: PASS; 5-position batch; Workers tests: 5');
console.log('  Routes/migrations/bindings/remote writes/key material: zero');
