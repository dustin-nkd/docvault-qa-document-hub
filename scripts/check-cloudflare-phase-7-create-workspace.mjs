import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7CreateWorkspace } from './cloudflare-phase-7-create-workspace-policy.mjs';
import { PRESENTATION_BY_CODE, CREATE_WORKSPACE_CODES, NAME_RULE }
    from '../js/collaboration/create-workspace.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase7CreateWorkspace({
    manifest: JSON.parse(read('config/cloudflare/phase-7-create-workspace.json')),
    contract: JSON.parse(read('config/cloudflare/phase-7-ui-contract.json')),
    journeySource: read('js/collaboration/create-workspace.js'),
    // Imported, not parsed: the mapping is compared to the frozen contract by
    // value, so a paraphrase cannot pass where the real table would fail.
    journeyExports: { PRESENTATION_BY_CODE, CREATE_WORKSPACE_CODES, NAME_RULE },
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    serverSource: read('functions/_lib/workspaces/workspace-bootstrap.ts'),
    unitTestSource: read('tests/collaboration-create-workspace.test.mjs')
});

console.log('Cloudflare Phase 7 create workspace gate passed');
console.log('  CF-P7-004: PASS; P7-G2B authorizes CF-P7-005 only');
console.log('  The creator envelope is sealed only after the server returns its binding');
console.log('  One idempotency key covers both calls, and a retry reuses it');
console.log('  The name rule mirrors the server in code points; the server stays the authority');
console.log('  A missing device explains itself instead of failing on submit');
