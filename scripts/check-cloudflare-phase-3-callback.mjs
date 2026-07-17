import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase3OAuthCallback } from './cloudflare-phase-3-callback-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase3OAuthCallback({
    manifest: json('config/cloudflare/phase-3-oauth-callback.json'),
    sprintManifest: json('config/cloudflare/phase-3-sprint-plan.json'),
    sprintSource: read('docs/collaboration-foundation/phase-3-sprint.md'),
    contractSource: read('docs/collaboration-foundation/phase-3-identity-session-contract.md'),
    sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
    workersTestSource: read('tests/cloudflare/oauth-callback.workers.test.ts'),
    routeSource: read('functions/api/v1/[[path]].ts'), wrangler: json('wrangler.jsonc'),
    migrationManifest: json('migrations/manifest.json'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-3/${id}.md`)]))
});

console.log('Cloudflare Phase 3 OAuth callback gate passed');
console.log('  CF-P3-004: PASS; Workers tests: 10; evidence: API-001, INT-002, SEC-004');
console.log('  Routes/migrations/bindings/secrets/OAuth apps/remote changes: zero');
console.log('  Historical callback gate preserved; CF-P3-008 now PASS');
