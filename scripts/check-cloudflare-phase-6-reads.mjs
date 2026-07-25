import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Reads } from './cloudflare-phase-6-reads-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-6');
const READ_EVIDENCE = ['CF-EV-P6-UT-004', 'CF-EV-P6-INT-002', 'CF-EV-P6-SEC-005'];

validatePhase6Reads({
    manifest: json('config/cloudflare/phase-6-document-reads.json'),
    readsSource: read('functions/_lib/documents/document-reads.ts'),
    integrationTestSource: read('tests/cloudflare/document-reads.workers.test.ts'),
    evidenceSources: Object.fromEntries(READ_EVIDENCE
        .map(id => [id, fs.readFileSync(path.join(evidenceDirectory, `${id}.md`), 'utf8')]))
});

console.log('Cloudflare Phase 6 document reads passed');
console.log('  CF-P6-005: PASS; P6-G2C authorizes CF-P6-006 only');
console.log('  Sprint gate G2 proven: an Editor creates, a Viewer reads document and history');
console.log('  Workspace-scoped SQL, one shared denial code, unforgeable bound cursors, no-store responses');
