import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6SprintPlan } from './cloudflare-phase-6-sprint-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase6SprintPlan({
    manifest: json('config/cloudflare/phase-6-sprint-plan.json'),
    sprintSource: read('docs/collaboration-foundation/phase-6-sprint.md'),
    handoff: read('docs/collaboration-foundation/phase-6-handoff.md'),
    apiContract: read('docs/collaboration-foundation/api-contract.md'),
    migrationManifest: json('migrations/manifest.json'),
    wrangler: json('wrangler.jsonc')
});

console.log('Cloudflare Phase 6 sprint plan passed');
console.log('  CF-P6-S01: planned; P6-G0 approval authorizes CF-P6-001 only');
console.log('  Schema 12 sufficient — sprint approval carries no migration authority');
console.log('  Document routes: 8 (7 document + 1 mutation reconcile); Viewer mutation routes: 0');
console.log('  Production identity, D1, document routes, and collaboration activation: NO-GO');
