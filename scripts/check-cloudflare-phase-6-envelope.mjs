import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Envelope } from './cloudflare-phase-6-envelope-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-6');
const ENVELOPE_EVIDENCE = ['CF-EV-P6-UT-002', 'CF-EV-P6-VEC-001', 'CF-EV-P6-SEC-003'];

validatePhase6Envelope({
    manifest: json('config/cloudflare/phase-6-document-envelope.json'),
    envelopeSource: read('js/collaboration/document-envelope.js'),
    fingerprintSource: read('functions/_lib/documents/request-fingerprint.ts'),
    vectorSource: read('tests/fixtures/cloudflare/phase-6-document-vectors.json'),
    nodeTestSource: read('tests/document-envelope.test.mjs'),
    workersTestSource: read('tests/cloudflare/document-fingerprint.workers.test.ts'),
    contractFreeze: json('config/cloudflare/phase-6-contract-freeze.json'),
    evidenceSources: Object.fromEntries(ENVELOPE_EVIDENCE
        .map(id => [id, fs.readFileSync(path.join(evidenceDirectory, `${id}.md`), 'utf8')]))
});

console.log('Cloudflare Phase 6 document envelope passed');
console.log('  CF-P6-003: PASS; P6-G2A authorizes CF-P6-004 only');
console.log('  A256GCM-doc-v1 with AAD bound to workspace, document, revision, key, envelope version');
console.log('  CF-VEC-P6-ENV-001 and CF-VEC-P6-FPR-001: 100% agreement with an independent node:crypto oracle');
