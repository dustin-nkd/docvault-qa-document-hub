import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREVIEW_IDENTITY_EVIDENCE, validatePhase3PreviewIdentityPolicy }
    from './cloudflare-phase-3-preview-identity-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase3PreviewIdentityPolicy({
    manifest: json('config/cloudflare/phase-3-preview-identity.json'),
    sprint: json('config/cloudflare/phase-3-sprint-plan.json'),
    wrangler: json('wrangler.jsonc'), burstWrangler: json('wrangler.identity-burst.jsonc'),
    runtimeSource: read('functions/_lib/identity/runtime-handler.ts'),
    workerSource: read('workers/identity-burst-limiter.ts'),
    evidenceSources: Object.fromEntries(PREVIEW_IDENTITY_EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-3/${id}.md`)]))
});

console.log('Cloudflare Phase 3 Preview identity gate passed');
console.log('  CF-P3-008: PASS; isolated Preview identity provisioned and cleaned');
console.log('  Gate P3-G4A: pending; authorizes CF-P3-009 only');
