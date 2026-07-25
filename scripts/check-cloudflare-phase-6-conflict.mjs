import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Conflict } from './cloudflare-phase-6-conflict-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-6');
const CONFLICT_EVIDENCE = ['CF-EV-P6-E2E-002', 'CF-EV-P6-QA-003', 'CF-EV-P6-SEC-007', 'CF-EV-P6-UX-001'];

validatePhase6Conflict({
    manifest: json('config/cloudflare/phase-6-conflict-copy.json'),
    moduleSource: read('js/collaboration/conflict-resolution.js'),
    nodeTestSource: read('tests/conflict-resolution.test.mjs'),
    workersTestSource: read('tests/cloudflare/conflict-resolution.workers.test.ts'),
    browserTestSource: read('tests/browser-conflict-resolution.mjs'),
    contractFreeze: json('config/cloudflare/phase-6-contract-freeze.json'),
    packageJson: json('package.json'),
    evidenceSources: Object.fromEntries(CONFLICT_EVIDENCE
        .map(id => [id, fs.readFileSync(path.join(evidenceDirectory, `${id}.md`), 'utf8')]))
});

console.log('Cloudflare Phase 6 conflict resolution and copy passed');
console.log('  CF-P6-007: PASS; P6-G3A authorizes CF-P6-008 only');
console.log('  Four explicit resolutions, no automatic merge, only a confirmed discard drops a draft');
console.log('  Credential refused before destination encryption; copy unlinked at revision 1');
