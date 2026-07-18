import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    EVIDENCE,
    SOURCES,
    validatePhase4InvitationLifecycle
} from './cloudflare-phase-4-invitation-lifecycle-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase4InvitationLifecycle({
    manifest: json('config/cloudflare/phase-4-invitation-lifecycle.json'),
    prerequisite: json('config/cloudflare/phase-4-central-rbac.json'),
    sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
    workersTestSource: read('tests/cloudflare/invitation-lifecycle.workers.test.ts'),
    routeSource: read('functions/api/v1/[[path]].ts'),
    wrangler: json('wrangler.jsonc'),
    migrationManifest: json('migrations/manifest.json'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(evidenceId => [evidenceId,
        read(`docs/collaboration-foundation/evidence/phase-4/${evidenceId}.md`)]))
});

console.log('Cloudflare Phase 4 invitation lifecycle gate passed');
console.log('  CF-P4-004: PASS; lifecycle operations: 6; Workers tests: 8');
console.log('  Routes/migrations/bindings/remote writes/activation: zero');

