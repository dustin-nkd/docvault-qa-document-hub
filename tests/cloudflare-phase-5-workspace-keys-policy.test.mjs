import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, validatePhase5WorkspaceKeys } from '../scripts/cloudflare-phase-5-workspace-keys-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const input = () => ({
    manifest: json('config/cloudflare/phase-5-workspace-keys.json'),
    sprint: json('config/cloudflare/phase-5-sprint-plan.json'),
    migrationManifest: json('migrations/manifest.json'),
    serviceSource: read('functions/_lib/workspace-keys/workspace-key-service.ts'),
    indexSource: read('functions/_lib/workspace-keys/index.ts'),
    primitivesSource: read('functions/_lib/e2ee/primitives.ts'),
    workersTest: read('tests/cloudflare/workspace-key-services.workers.test.ts'),
    routeSource: read('functions/_lib/collaboration/runtime-handler.ts'),
    wrangler: json('wrangler.jsonc'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-5/${id}.md`)])),
    implementationSource: read('docs/collaboration-foundation/phase-5-workspace-keys.md')
});

// NO-OP CONTROL. Under decision D-P7-01 the real wrangler.jsonc carries
// env.preview.vars.COLLABORATION_ENABLED = 'true'. The unmutated real input must therefore
// still validate; if this ever throws, every assert.throws below would pass for the wrong
// reason (a no-op mutation would throw identically) and this suite would prove nothing.
test('CF-P5-005 locks atomic bootstrap, current-envelope authority, and derived readiness', () => {
    assert.equal(validatePhase5WorkspaceKeys(input()), true);
});

test('CF-P5-005 rejects plaintext, authority, migration, route, activation, and evidence drift', () => {
    // Non-vacuity guard, asserted in-suite so the drift cases below cannot go green on a
    // gate that already rejects its own unmutated input (see D-P7-01).
    assert.doesNotThrow(() => validatePhase5WorkspaceKeys(input()),
        'NO-OP CONTROL failed: unmutated real input is rejected, so every case below is vacuous');

    for (const [name, mutate, expected] of [
        ['plaintext', value => { value.serviceSource += '\nconst plaintextDek = true;'; }],
        ['authority', value => { value.serviceSource = value.serviceSource.replaceAll("wrapper.role IN ('owner','admin')", "wrapper.role IN ('owner','admin','editor')"); }],
        ['migration', value => { value.migrationManifest.entries.push({ sequence: 12 }); }],
        ['route', value => { value.routeSource += "\nimport '../workspace-keys';"; }],
        // D-P7-01 authorizes COLLABORATION_ENABLED = 'true' for PREVIEW ONLY. This gate is
        // production-scoped (cloudflare-phase-5-workspace-keys-policy.mjs:48), so production
        // stays the target here and the message is pinned: the proof that production can
        // never activate collaboration must not survive as a coincidental throw.
        ['production', value => { value.wrangler.env.production.vars.COLLABORATION_ENABLED = 'true'; }, /Activation boundary drifted/],
        ['evidence', value => { delete value.evidenceSources['CF-EV-P5-SEC-005']; }]
    ]) {
        const value = input(); mutate(value);
        assert.throws(() => validatePhase5WorkspaceKeys(value), expected, name);
    }
});
