import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2QualityMatrix } from '../scripts/cloudflare-phase-2-quality-matrix-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
function actual() {
    const quality = JSON.parse(read('config/cloudflare/phase-2-quality-matrix.json'));
    return { quality, manifest: JSON.parse(read('migrations/manifest.json')),
        migrationSource: read(`migrations/collaboration/${quality.schema_correction.migration}`),
        retentionSource: read('functions/_lib/persistence/retention.ts'),
        schemaSource: read('functions/_lib/collaboration-schema.ts'),
        workerSources: {
            migrations: read('tests/cloudflare/migration-compatibility-matrix.workers.test.ts'),
            retention: read('tests/cloudflare/retention-privacy-scale.workers.test.ts'),
            scale: read('tests/cloudflare/collaboration-readiness.workers.test.ts'),
            apiSideEffects: read('tests/cloudflare/api-side-effects.workers.test.ts')
        }, apiSources: { shell: read('functions/_lib/api-shell.mjs'), route: read('functions/api/v1/[[path]].ts') },
        evidenceSources: Object.fromEntries(quality.evidence.map(id => [id,
            read(`docs/collaboration-foundation/evidence/phase-2/${id}.md`)])),
        wrangler: JSON.parse(read('wrangler.jsonc')) };
}
test('CF-P2-006 locks migration, retention, privacy, scale, and disabled-runtime evidence', () => {
    assert.equal(validatePhase2QualityMatrix(actual()), true);
});
test('CF-P2-006 rejects matrix, purge, performance, and schema drift', () => {
    for (const mutate of [
        input => { input.quality.migration_matrix.pop(); },
        input => { input.quality.retention.maximum_rows_per_type = 1000; },
        input => { input.retentionSource += '\nconst unsafe = `SELECT * FROM audit_events`;'; },
        input => { input.migrationSource = input.migrationSource.replace('retention_purge_runs_no_delete', 'removed_guard'); },
        input => { input.workerSources.scale = input.workerSources.scale.replace('2_000', '20_000'); }
    ]) { const input = actual(); mutate(input); assert.throws(() => validatePhase2QualityMatrix(input)); }
});
test('CF-P2-006 rejects API reachability, remote state, activation, and evidence loss', () => {
    for (const mutate of [
        input => { input.apiSources.shell += '\nconst db = env.COLLAB_DB;'; },
        input => { input.wrangler.d1_databases = [{ binding: 'COLLAB_DB', database_id: 'forbidden' }]; },
        input => { input.wrangler.env.production.vars.COLLABORATION_ENABLED = 'true'; },
        input => { delete input.evidenceSources['CF-EV-P2-SEC-006']; }
    ]) { const input = actual(); mutate(input); assert.throws(() => validatePhase2QualityMatrix(input)); }
});
