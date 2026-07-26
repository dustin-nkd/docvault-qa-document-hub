import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Invitations } from './cloudflare-phase-7-invitation-policy.mjs';
import { invitationDecision, holdAcceptanceUrl } from '../js/collaboration/invitations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase7Invitations({
    manifest: JSON.parse(read('config/cloudflare/phase-7-invitations.json')),
    contract: JSON.parse(read('config/cloudflare/phase-7-ui-contract.json')),
    journeySource: read('js/collaboration/invitations.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    // The one-time, fragment-only claim is checked against the contract that
    // makes it, so the surface cannot outlive the rule it depends on.
    apiContract: read('docs/collaboration-foundation/api-contract.md'),
    unitTestSource: read('tests/collaboration-invitations.test.mjs'),
    journeyExports: { invitationDecision, holdAcceptanceUrl }
});

console.log('Cloudflare Phase 7 invitation gate passed');
console.log('  CF-P7-007: PASS; P7-G3 authorizes CF-P7-008 only');
console.log('  The one-time link never reaches storage, a log, a query string, or an anchor');
console.log('  It is shown once, says so, and cannot be read after the caller clears it');
console.log('  Only an owner invites or revokes an admin; every denial states a reason');
