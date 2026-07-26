import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Accept } from './cloudflare-phase-7-accept-policy.mjs';
import { takeTokenFromFragment } from '../js/collaboration/invitation-accept.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase7Accept({
    manifest: JSON.parse(read('config/cloudflare/phase-7-invitation-accept.json')),
    contract: JSON.parse(read('config/cloudflare/phase-7-ui-contract.json')),
    journeySource: read('js/collaboration/invitation-accept.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    apiContract: read('docs/collaboration-foundation/api-contract.md'),
    unitTestSource: read('tests/collaboration-invitation-accept.test.mjs'),
    // Run, not just read: the reader is exercised to prove it clears the bar.
    journeyExports: { takeTokenFromFragment }
});

console.log('Cloudflare Phase 7 invitation acceptance gate passed');
console.log('  CF-P7-008: PASS; P7-G3A authorizes CF-P7-009 only');
console.log('  The token leaves the address bar before any caller can see it');
console.log('  History is replaced, never pushed, so Back cannot restore the token');
console.log('  Only a pending invitation is actionable; the other three explain themselves');
console.log('  Acceptance says up front that it grants membership, not a usable key');
