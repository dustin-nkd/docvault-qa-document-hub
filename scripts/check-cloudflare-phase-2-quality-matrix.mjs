import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2QualityMatrix } from './cloudflare-phase-2-quality-matrix-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const quality = JSON.parse(read('config/cloudflare/phase-2-quality-matrix.json'));
validatePhase2QualityMatrix({
    quality,
    manifest: JSON.parse(read('migrations/manifest.json')),
    migrationSource: read(`migrations/collaboration/${quality.schema_correction.migration}`),
    retentionSource: read('functions/_lib/persistence/retention.ts'),
    schemaSource: read('functions/_lib/collaboration-schema.ts'),
    workerSources: {
        migrations: read('tests/cloudflare/migration-compatibility-matrix.workers.test.ts'),
        retention: read('tests/cloudflare/retention-privacy-scale.workers.test.ts'),
        scale: read('tests/cloudflare/collaboration-readiness.workers.test.ts'),
        apiSideEffects: read('tests/cloudflare/api-side-effects.workers.test.ts')
    },
    apiSources: { shell: read('functions/_lib/api-shell.mjs'), route: read('functions/api/v1/[[path]].ts') },
    evidenceSources: Object.fromEntries(quality.evidence.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-2/${id}.md`)])),
    wrangler: JSON.parse(read('wrangler.jsonc'))
});
console.log('Cloudflare Phase 2 migration, retention, privacy, and scale gate passed');
console.log('  Migration matrix: 9 local empty/populated/fault/compatibility cases');
console.log('  Retention: bounded 30-day/365-day server-time purge with active-hold denial');
console.log('  Scale: 10,000 documents, 50 revisions, 13 indexed query contracts');
console.log('  Privacy/runtime: seven surfaces scanned; API disabled; no remote D1');
