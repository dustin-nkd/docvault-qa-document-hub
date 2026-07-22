import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, validatePhase5PreviewKeyFoundation } from './cloudflare-phase-5-preview-key-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));

validatePhase5PreviewKeyFoundation({
    manifest: json('config/cloudflare/phase-5-preview-key-foundation.json'),
    sprint: json('config/cloudflare/phase-5-sprint-plan.json'),
    wrangler: json('wrangler.jsonc'),
    migrationManifest: json('migrations/manifest.json'),
    handlerSource: read('functions/_lib/collaboration/key-runtime-handler.ts'),
    querySource: read('functions/_lib/workspace-keys/preview-key-queries.ts'),
    apiSource: read('functions/api/v1/[[path]].ts'),
    cursorSource: read('functions/_lib/collaboration/control-plane-cursor.ts'),
    workersTest: read('tests/cloudflare/preview-key-foundation.workers.test.ts'),
    reportSource: read('docs/collaboration-foundation/phase-5-preview-key-foundation.md'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-5/${id}.md`)]))
});

console.log('CF-P5-007 local Preview key foundation preflight passed');
console.log('  Remote changes: 0; checked-in route mode: disabled');
console.log('  Next decision: P5-G4 remote Preview authorization');
