import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7ApiClient } from './cloudflare-phase-7-api-client-policy.mjs';
import * as apiClient from '../js/collaboration/api-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

// Every collaboration module, so the single-transport-seam claim is checked
// against the directory rather than against a list someone remembered to update.
const collaborationDir = path.join(root, 'js', 'collaboration');
const collaborationSources = Object.fromEntries(
    fs.readdirSync(collaborationDir)
        .filter(name => name.endsWith('.js'))
        .sort()
        .map(name => [`js/collaboration/${name}`, read(`js/collaboration/${name}`)])
);

const manifest = JSON.parse(read('config/cloudflare/phase-7-api-client.json'));

await validatePhase7ApiClient({
    manifest,
    contract: JSON.parse(read('config/cloudflare/phase-7-ui-contract.json')),
    clientSource: read('js/collaboration/api-client.js'),
    entrySource: read('js/collaboration/entry.js'),
    deploymentSource: read('js/deployment.js'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    collaborationSources,
    unitTestSource: read('tests/collaboration-api-client.test.mjs'),
    clientExports: apiClient
});

console.log('Cloudflare Phase 7 API client gate passed');
console.log('  CF-P7-015: PASS; P7-G3F authorizes CF-P7-013 only');
console.log(`  Transport lives in exactly one of ${Object.keys(collaborationSources).length} `
    + 'collaboration modules, which is what the eleven surface gates assume');
console.log('  The twelve frozen error codes each present as the contract froze them; '
    + 'an unknown code fails closed');
console.log('  CSRF in memory only, an Idempotency-Key on every mutation and no read, '
    + 'cursors passed through unread');
console.log('  Availability is the deployment\'s own answer; the hostname is a pre-filter '
    + '(owner authorization, 2026-07-26)');

// Narrowed coverage is stated out loud, not left in a file nobody opens.
const pending = manifest.declared_limits.surfaces_not_yet_composed;
console.log(`  DECLARED LIMIT: ${pending.length} of 10 journey surfaces are built and gated but `
    + 'not yet composed into the shell — that is CF-P7-013 integration work');
console.log(`    ${pending.join(', ')}`);
