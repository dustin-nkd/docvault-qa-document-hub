import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Members } from './cloudflare-phase-7-member-policy.mjs';
import { memberActionDecision } from '../js/collaboration/member-list.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase7Members({
    manifest: JSON.parse(read('config/cloudflare/phase-7-member-list.json')),
    contract: JSON.parse(read('config/cloudflare/phase-7-ui-contract.json')),
    journeySource: read('js/collaboration/member-list.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    // The decisions are checked against the frozen matrix document itself, and
    // against the live function, so neither can drift alone.
    rbacDocument: read('docs/collaboration-foundation/domain-and-rbac.md'),
    unitTestSource: read('tests/collaboration-member-list.test.mjs'),
    journeyExports: { memberActionDecision }
});

console.log('Cloudflare Phase 7 member list gate passed');
console.log('  CF-P7-006: PASS; P7-G2D authorizes CF-P7-007 only');
console.log('  U3 held: a denied control stays visible, is disabled, and says why in announced text');
console.log('  Owner removal is denied to everyone; admin removal stays with the owner');
console.log('  A device without the workspace key cannot provision it to another');
console.log('  Readiness is reused from CF-P7-005 rather than restated');
