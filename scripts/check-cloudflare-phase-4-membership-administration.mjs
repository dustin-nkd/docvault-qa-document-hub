import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    EVIDENCE,
    SOURCES,
    validatePhase4MembershipAdministration
} from './cloudflare-phase-4-membership-administration-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase4MembershipAdministration({
    manifest: json('config/cloudflare/phase-4-membership-administration.json'),
    prerequisite: json('config/cloudflare/phase-4-invitation-lifecycle.json'),
    sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
    workersTestSource: read('tests/cloudflare/membership-administration.workers.test.ts'),
    routeSource: read('functions/api/v1/[[path]].ts'),
    wrangler: json('wrangler.jsonc'),
    migrationManifest: json('migrations/manifest.json'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(evidenceId => [evidenceId,
        read(`docs/collaboration-foundation/evidence/phase-4/${evidenceId}.md`)]))
});

console.log('Cloudflare Phase 4 membership administration gate passed');
console.log('  CF-P4-005: PASS; operations: 4; Workers tests: 8');
console.log('  Routes/migrations/bindings/remote writes/activation: zero');
