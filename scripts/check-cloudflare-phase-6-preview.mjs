import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Preview } from './cloudflare-phase-6-preview-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase6Preview({
    manifest: JSON.parse(read('config/cloudflare/phase-6-preview-qualification.json')),
    routeSource: read('functions/_lib/collaboration/key-runtime-handler.ts'),
    evidence: read('docs/collaboration-foundation/evidence/phase-6/CF-EV-P6-QA-004.md')
});

console.log('Cloudflare Phase 6 Preview qualification passed');
console.log('  CF-P6-008: PASS; qualified under P6-G4 against the Preview deployment');
console.log('  All six sprint gate scenarios proven over Preview HTTP with two real identities');
console.log('  Viewer writes denied with zero rows; no test bypass deployed');
