import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2PreviewD1 } from './cloudflare-phase-2-preview-d1-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceIds = ['CF-EV-P2-OPS-001', 'CF-EV-P2-INT-007', 'CF-EV-P2-SEC-007'];

validatePhase2PreviewD1({
    preview: json('config/cloudflare/phase-2-preview-d1.json'),
    manifest: json('migrations/manifest.json'),
    wrangler: json('wrangler.jsonc'),
    apiSources: {
        entry: read('functions/api/v1/[[path]].ts'),
        handler: read('functions/_lib/api-shell.mjs')
    },
    evidenceSources: Object.fromEntries(evidenceIds.map(id => [id, read(`docs/collaboration-foundation/evidence/phase-2/${id}.md`)]))
});

console.log('Cloudflare Phase 2 preview D1 gate passed');
console.log('  Gate P2-G3: APPROVED; CF-P2-007 PASS');
console.log('  Preview: one isolated D1 with nine migrations and zero entity rows');
console.log('  Production D1: absent; collaboration: disabled');
