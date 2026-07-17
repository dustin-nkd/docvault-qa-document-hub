import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ABUSE_EVIDENCE, ABUSE_SOURCES, validatePhase3AbusePolicy } from './cloudflare-phase-3-abuse-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const manifest = json('config/cloudflare/phase-3-abuse-observability.json');

validatePhase3AbusePolicy({
    manifest,
    sprintManifest: json('config/cloudflare/phase-3-sprint-plan.json'),
    sourceFiles: Object.fromEntries(ABUSE_SOURCES.map(file => [file, read(file)])),
    workersTestSource: read(manifest.workers_test_file),
    routeSource: read('functions/api/v1/[[path]].ts'),
    wrangler: json('wrangler.jsonc'),
    migrationManifest: json('migrations/manifest.json'),
    migrationSource: read(`migrations/collaboration/${manifest.migration}`),
    evidenceSources: Object.fromEntries(ABUSE_EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-3/${id}.md`)]))
});

console.log('Cloudflare Phase 3 abuse/observability gate passed');
console.log('  CF-P3-007: PASS; atomic D1 tiers, safe events, bounded provider resilience');
console.log('  Historical abuse gate preserved; CF-P3-008 now PASS');
