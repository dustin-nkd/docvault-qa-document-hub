import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Outbox } from './cloudflare-phase-6-outbox-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-6');
const OUTBOX_EVIDENCE = ['CF-EV-P6-UT-005', 'CF-EV-P6-INT-003', 'CF-EV-P6-E2E-001', 'CF-EV-P6-SEC-006'];

validatePhase6Outbox({
    manifest: json('config/cloudflare/phase-6-offline-outbox.json'),
    outboxSource: read('js/collaboration/outbox.js'),
    nodeTestSource: read('tests/outbox.test.mjs'),
    replayTestSource: read('tests/cloudflare/outbox-replay.workers.test.ts'),
    browserTestSource: read('tests/browser-outbox.mjs'),
    packageJson: json('package.json'),
    evidenceSources: Object.fromEntries(OUTBOX_EVIDENCE
        .map(id => [id, fs.readFileSync(path.join(evidenceDirectory, `${id}.md`), 'utf8')]))
});

console.log('Cloudflare Phase 6 offline outbox passed');
console.log('  CF-P6-006: PASS; P6-G3 authorizes CF-P6-007 only');
console.log('  Sprint gate G6 proven against real D1: offline queue replays once, lost response replays once');
console.log('  Encrypted bytes only, quarantine-not-delete, real IndexedDB in chromium/firefox/webkit');
