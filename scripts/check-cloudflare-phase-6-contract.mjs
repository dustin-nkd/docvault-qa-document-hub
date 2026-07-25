import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Contract } from './cloudflare-phase-6-contract-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase6Contract({
    manifest: json('config/cloudflare/phase-6-contract-freeze.json'),
    freezeSource: read('docs/collaboration-foundation/phase-6-document-contract-freeze.md'),
    stabilityEvidence: read('docs/collaboration-foundation/evidence/phase-6/CF-EV-P6-STA-001.md'),
    securityEvidence: read('docs/collaboration-foundation/evidence/phase-6/CF-EV-P6-SEC-001.md'),
    sprintPlan: json('config/cloudflare/phase-6-sprint-plan.json'),
    migrationManifest: json('migrations/manifest.json')
});

console.log('Cloudflare Phase 6 contract freeze passed');
console.log('  CF-P6-001: PASS; P6-G1 authorizes CF-P6-002 only');
console.log('  Schema 12 sufficient — zero migrations, routes, or source modules created');
console.log('  Route surface frozen at 8 (7 document + 1 mutation reconcile)');
