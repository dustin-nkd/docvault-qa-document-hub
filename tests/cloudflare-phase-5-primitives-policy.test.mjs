import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase5Primitives } from '../scripts/cloudflare-phase-5-primitives-policy.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const input = () => ({
    manifest: json('config/cloudflare/phase-5-crypto-primitives.json'),
    sprint: json('config/cloudflare/phase-5-sprint-plan.json'),
    contractFreeze: json('config/cloudflare/phase-5-contract-freeze.json'),
    sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
    workersTest: read('tests/cloudflare/e2ee-primitives.workers.test.ts'),
    referenceTest: read('tests/cloudflare-phase-5-reference-vectors.test.mjs'),
    vectorFixture: json('tests/fixtures/cloudflare/phase-5-crypto-vectors.json'),
    routeSource: read('functions/_lib/collaboration/runtime-handler.ts'),
    migrationManifest: json('migrations/manifest.json'), wrangler: json('wrangler.jsonc'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-5/${id}.md`)])),
    implementationSource: read('docs/collaboration-foundation/phase-5-crypto-primitives.md')
});

test('CF-P5-002 locks strict primitives, independent vectors, evidence, and disabled boundaries', () => {
    assert.equal(validatePhase5Primitives(input()), true);
});

test('CF-P5-002 rejects downgrade, vector drift, route reachability, migration, and activation', () => {
    for (const mutate of [
        value => { value.manifest.implementation.fallback = 'plaintext'; },
        value => { value.vectorFixture.vectors.pop(); },
        value => { value.sourceFiles['functions/_lib/e2ee/primitives.ts'] = value.sourceFiles['functions/_lib/e2ee/primitives.ts'].replace('600_000', '300_000'); },
        value => { value.routeSource += "\nimport { wrapWorkspaceKey } from '../e2ee';"; },
        value => { value.migrationManifest.entries.push({ sequence: 11 }); },
        value => { value.wrangler.env.production.vars.COLLABORATION_ENABLED = 'true'; },
        value => { delete value.evidenceSources['CF-EV-P5-SEC-002']; }
    ]) {
        const value = input(); mutate(value);
        assert.throws(() => validatePhase5Primitives(value));
    }
});
