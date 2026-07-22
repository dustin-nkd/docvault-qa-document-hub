import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase5SprintPlan } from './cloudflare-phase-5-sprint-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase5SprintPlan({
    manifest: json('config/cloudflare/phase-5-sprint-plan.json'),
    sprintSource: read('docs/collaboration-foundation/phase-5-sprint.md'),
    handoff: read('docs/collaboration-foundation/phase-5-handoff.md'),
    implementationPlan: read('docs/collaboration-foundation/implementation-plan.md'),
    traceability: read('docs/collaboration-foundation/traceability-matrix.md'),
    threatModel: read('docs/collaboration-foundation/threat-model.md'),
    riskRegister: read('docs/collaboration-foundation/risk-register.md'),
    phase4Exit: json('config/cloudflare/phase-4-exit-gate.json'),
    migrationManifest: json('migrations/manifest.json'),
    wrangler: json('wrangler.jsonc')
});

console.log('Cloudflare Phase 5 sprint plan passed');
console.log('  CF-P5-S01: active; CF-P5-001 through CF-P5-006 PASS; P5-G3 pending');
console.log('  Encrypted documents/revisions/sync: deferred to Phase 6');
console.log('  Production identity, D1, key routes, and collaboration activation: NO-GO');
