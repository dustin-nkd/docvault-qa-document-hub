import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase3OAuthTransactions } from './cloudflare-phase-3-oauth-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase3OAuthTransactions({
    manifest: json('config/cloudflare/phase-3-oauth-transactions.json'),
    sprintManifest: json('config/cloudflare/phase-3-sprint-plan.json'),
    sprintSource: read('docs/collaboration-foundation/phase-3-sprint.md'),
    contractSource: read('docs/collaboration-foundation/phase-3-identity-session-contract.md'),
    sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
    workersTestSource: read('tests/cloudflare/oauth-transaction-lifecycle.workers.test.ts'),
    routeSource: read('functions/api/v1/[[path]].ts'),
    wrangler: json('wrangler.jsonc'),
    migrationManifest: json('migrations/manifest.json'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-3/${id}.md`)]))
});

console.log('Cloudflare Phase 3 OAuth transaction gate passed');
console.log('  CF-P3-003: PASS; Workers tests: 8; evidence: UT-002, INT-001, SEC-003');
console.log('  Routes/schema/bindings/secrets/remote/user/session changes: zero');
console.log('  Historical transaction gate preserved; CF-P3-006 now PASS');
