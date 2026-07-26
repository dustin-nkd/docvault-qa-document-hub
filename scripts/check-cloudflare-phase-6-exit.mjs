import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Exit } from './cloudflare-phase-6-exit-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase6Exit({
    manifest: json('config/cloudflare/phase-6-exit-gate.json'),
    exitReport: read('docs/collaboration-foundation/phase-6-exit-report.md'),
    handoff: read('docs/collaboration-foundation/phase-7-handoff.md'),
    sprintPlan: json('config/cloudflare/phase-6-sprint-plan.json'),
    packageJson: json('package.json')
});

console.log('Cloudflare Phase 6 exit gate passed');
console.log('  CF-P6-009: PARTIAL; P6-G5 NOT granted');
console.log('  Gate scenarios: 6/6 at the persistence layer, 4/6 over Preview HTTP (G2 and G3 open)');
console.log('  Identity provenance recorded as the owner personal account, not synthetic');
