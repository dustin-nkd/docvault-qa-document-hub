import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2Recovery } from '../scripts/cloudflare-phase-2-recovery-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const ids = ['CF-EV-P2-OPS-002', 'CF-EV-P2-OPS-003', 'CF-EV-P2-E2E-001', 'CF-EV-P2-SEC-008'];
const base = () => ({
    recovery: json('config/cloudflare/phase-2-recovery-rehearsal.json'),
    preview: json('config/cloudflare/phase-2-preview-d1.json'),
    wrangler: json('wrangler.jsonc'),
    apiSources: { entry: read('functions/api/v1/[[path]].ts'), handler: read('functions/_lib/api-shell.mjs') },
    evidenceSources: Object.fromEntries(ids.map(id => [id, read(`docs/collaboration-foundation/evidence/phase-2/${id}.md`)]))
});

test('CF-P2-008 locks disposable recovery evidence while shared environments stay untouched', () => {
    assert.equal(validatePhase2Recovery(base()), true);
});

test('CF-P2-008 rejects restore, invariant, cleanup, runtime, and activation drift', () => {
    for (const mutate of [
        input => { input.recovery.shared_preview.restore_attempts = 1; },
        input => { input.recovery.recovery_resource.deleted = false; },
        input => { input.recovery.restored_invariants.ciphertext_bytes_and_digests = false; },
        input => { input.recovery.runtime_compatibility.previous_disabled_api_status = 200; },
        input => { input.recovery.recovery.schema_downgrade_attempts = 1; },
        input => { input.recovery.environment_boundary.collaboration_enabled = true; },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; }
    ]) {
        const input = base();
        mutate(input);
        assert.throws(() => validatePhase2Recovery(input));
    }
});

test('CF-P2-008 rejects raw bookmarks, persistence reachability, and evidence loss', () => {
    for (const mutate of [
        input => { input.recovery.recovery.undo_bookmark_sha256 = 'raw'; },
        input => { input.apiSources.handler += '\nconst db = env.COLLAB_DB;'; },
        input => { delete input.evidenceSources['CF-EV-P2-SEC-008']; },
        input => { input.recovery.p0_p1_exceptions.push('P1'); }
    ]) {
        const input = base();
        mutate(input);
        assert.throws(() => validatePhase2Recovery(input));
    }
});
