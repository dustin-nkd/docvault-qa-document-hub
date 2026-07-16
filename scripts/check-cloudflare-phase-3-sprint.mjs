import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase3SprintPlan } from './cloudflare-phase-3-sprint-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase3SprintPlan({
    manifest: json('config/cloudflare/phase-3-sprint-plan.json'),
    sprintSource: read('docs/collaboration-foundation/phase-3-sprint.md'),
    traceability: read('docs/collaboration-foundation/traceability-matrix.md'),
    threatModel: read('docs/collaboration-foundation/threat-model.md'),
    riskRegister: read('docs/collaboration-foundation/risk-register.md'),
    wrangler: json('wrangler.jsonc')
});

console.log('Cloudflare Phase 3 sprint plan passed');
console.log('  Stories: CF-P3-001 PASS; nine planned; P3-G1 pending');
console.log('  Identity runtime: preview-only after explicit P3-G4');
console.log('  Production/GitHub Pages identity and collaboration: disabled');
