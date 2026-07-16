import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2Recovery } from './cloudflare-phase-2-recovery-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceIds = ['CF-EV-P2-OPS-002', 'CF-EV-P2-OPS-003', 'CF-EV-P2-E2E-001', 'CF-EV-P2-SEC-008'];

validatePhase2Recovery({
    recovery: json('config/cloudflare/phase-2-recovery-rehearsal.json'),
    preview: json('config/cloudflare/phase-2-preview-d1.json'),
    wrangler: json('wrangler.jsonc'),
    apiSources: {
        entry: read('functions/api/v1/[[path]].ts'),
        handler: read('functions/_lib/api-shell.mjs')
    },
    evidenceSources: Object.fromEntries(evidenceIds.map(id => [id, read(`docs/collaboration-foundation/evidence/phase-2/${id}.md`)]))
});

console.log('Cloudflare Phase 2 recovery gate passed');
console.log('  Gate P2-G4: APPROVED; CF-P2-008 PASS');
console.log('  Disposable Time Travel restore: invariant-complete and cleaned up');
console.log('  Shared preview and production restores: zero; collaboration: disabled');
