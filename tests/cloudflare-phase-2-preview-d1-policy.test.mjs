import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2PreviewD1 } from '../scripts/cloudflare-phase-2-preview-d1-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const ids = ['CF-EV-P2-OPS-001', 'CF-EV-P2-INT-007', 'CF-EV-P2-SEC-007'];
const base = () => ({
    preview: json('config/cloudflare/phase-2-preview-d1.json'),
    manifest: json('migrations/manifest.json'),
    wrangler: json('wrangler.jsonc'),
    apiSources: { entry: read('functions/api/v1/[[path]].ts'), handler: read('functions/_lib/api-shell.mjs') },
    evidenceSources: Object.fromEntries(ids.map(id => [id, read(`docs/collaboration-foundation/evidence/phase-2/${id}.md`)]))
});

test('CF-P2-007 locks one migrated preview D1 while production and collaboration stay disabled', () => {
    assert.equal(validatePhase2PreviewD1(base()), true);
});

test('CF-P2-007 rejects resource, migration, production, data, and activation drift', () => {
    for (const mutate of [
        input => { input.preview.resource.database_name = 'other'; },
        input => { input.preview.migration.applied_count = 8; },
        input => { input.preview.migration.foreign_key_violations = 1; },
        input => { input.preview.remote_verification.entity_rows = 1; },
        input => { input.preview.binding.environment = 'production'; },
        input => { input.preview.environment_boundary.production_d1_bound = true; },
        input => { input.preview.environment_boundary.collaboration_enabled = true; },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; }
    ]) {
        const input = base();
        mutate(input);
        assert.throws(() => validatePhase2PreviewD1(input));
    }
});

test('CF-P2-007 rejects persistence reachability and evidence loss', () => {
    for (const mutate of [
        input => { input.apiSources.handler += '\nconst db = env.COLLAB_DB;'; },
        input => { delete input.evidenceSources['CF-EV-P2-SEC-007']; },
        input => { input.preview.p0_p1_exceptions.push('P1'); }
    ]) {
        const input = base();
        mutate(input);
        assert.throws(() => validatePhase2PreviewD1(input));
    }
});
