import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Sync } from './cloudflare-phase-7-sync-policy.mjs';
import { SYNC_STATES, deriveSyncState, presentSyncState, recoverySituations }
    from '../js/collaboration/sync-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase7Sync({
    manifest: JSON.parse(read('config/cloudflare/phase-7-sync-state.json')),
    contract: JSON.parse(read('config/cloudflare/phase-7-ui-contract.json')),
    journeySource: read('js/collaboration/sync-state.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    unitTestSource: read('tests/collaboration-sync-state.test.mjs'),
    // Run, not just read: the non-disclosure rule is exercised on every branch.
    journeyExports: { SYNC_STATES, deriveSyncState, presentSyncState, recoverySituations }
});

console.log('Cloudflare Phase 7 sync state gate passed');
console.log('  CF-P7-009: PASS; P7-G3B authorizes CF-P7-010 only');
console.log('  Exactly five states, each with its own shape, none left to colour');
console.log('  Access removed needs a completed membership re-check, never a status code');
console.log('  Expired and quarantined stay recovery situations, not a flattened error');
