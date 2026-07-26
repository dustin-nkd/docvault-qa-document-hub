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
console.log('  CF-P6-009: PASS; P6-G5 granted; all nine stories PASS');
console.log('  Gate scenarios: 6/6 at the persistence layer, 6/6 over Preview HTTP');
console.log('  Identity provenance recorded as two owner personal accounts, not synthetic');
console.log('  Preview cleanup partial by design and disclosed, not reported complete');
