import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    EVIDENCE,
    SOURCES,
    validatePhase4AuditScopedReads
} from './cloudflare-phase-4-audit-scoped-reads-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase4AuditScopedReads({
    manifest: json('config/cloudflare/phase-4-audit-scoped-reads.json'),
    prerequisite: json('config/cloudflare/phase-4-membership-administration.json'),
    sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
    workersTestSource: read('tests/cloudflare/audit-scoped-reads.workers.test.ts'),
    routeSource: read('functions/api/v1/[[path]].ts'),
    wrangler: json('wrangler.jsonc'),
    migrationManifest: json('migrations/manifest.json'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(evidenceId => [evidenceId,
        read(`docs/collaboration-foundation/evidence/phase-4/${evidenceId}.md`)]))
});

console.log('Cloudflare Phase 4 audit scoped-read gate passed');
console.log('  CF-P4-006: PASS; operations: 3; Workers tests: 8');
console.log('  Routes/migrations/bindings/remote writes/activation: zero');
