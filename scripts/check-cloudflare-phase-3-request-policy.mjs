import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase3RequestPolicy } from './cloudflare-phase-3-request-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase3RequestPolicy({
    manifest: json('config/cloudflare/phase-3-request-policy.json'),
    sprintManifest: json('config/cloudflare/phase-3-sprint-plan.json'),
    sprintSource: read('docs/collaboration-foundation/phase-3-sprint.md'),
    contractSource: read('docs/collaboration-foundation/phase-3-identity-session-contract.md'),
    sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
    workersTestSource: read('tests/cloudflare/identity-request-policy.workers.test.ts'),
    routeSource: read('functions/api/v1/[[path]].ts'),
    wrangler: json('wrangler.jsonc'),
    migrationManifest: json('migrations/manifest.json'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-3/${id}.md`)]))
});

console.log('Cloudflare Phase 3 request-policy gate passed');
console.log('  CF-P3-006: PASS; Workers tests: 12; evidence: UT-004, API-003, SEC-006');
console.log('  Identity/business route calls, migrations, bindings, secrets, remote changes: zero');
console.log('  Historical request-policy gate preserved; CF-P3-007 now PASS');
