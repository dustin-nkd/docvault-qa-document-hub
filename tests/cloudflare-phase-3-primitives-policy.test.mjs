import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, validatePhase3IdentityPrimitives } from '../scripts/cloudflare-phase-3-primitives-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    const evidenceIds = ['CF-EV-P3-UT-001', 'CF-EV-P3-SEC-002'];
    return {
        manifest: json('config/cloudflare/phase-3-identity-primitives.json'),
        sprintManifest: json('config/cloudflare/phase-3-sprint-plan.json'),
        sprintSource: read('docs/collaboration-foundation/phase-3-sprint.md'),
        contractSource: read('docs/collaboration-foundation/phase-3-identity-session-contract.md'),
        sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
        workersTestSource: read('tests/cloudflare/identity-primitives.workers.test.ts'),
        routeSource: read('functions/api/v1/[[path]].ts'),
        wrangler: json('wrangler.jsonc'), migrationManifest: json('migrations/manifest.json'),
        evidenceSources: Object.fromEntries(evidenceIds.map(id => [id,
            read(`docs/collaboration-foundation/evidence/phase-3/${id}.md`)]))
    };
}

test('CF-P3-002 locks executable primitives, vectors, evidence, and disabled boundaries', () => {
    assert.equal(validatePhase3IdentityPrimitives(actualInput()), true);
});

test('CF-P3-002 rejects route, schema, binding, secret, remote, and production activation drift', () => {
    for (const mutate of [
        input => { input.routeSource += "\nimport '../../_lib/identity';"; },
        input => { input.migrationManifest.entries.push({ version: 10 }); },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { input.wrangler.env.preview.vars.IDENTITY_RUNTIME_MODE = 'preview-only'; },
        input => { input.manifest.scope.remote_writes = 1; },
        input => { input.manifest.scope.identity_enabled = true; }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase3IdentityPrimitives(input));
    }
});

test('CF-P3-002 rejects weak crypto, missing vectors, secret echo patterns, evidence, and gate drift', () => {
    for (const mutate of [
        input => { input.sourceFiles['functions/_lib/identity/crypto.ts'] = input.sourceFiles['functions/_lib/identity/crypto.ts'].replace('crypto.getRandomValues', 'Math.random'); },
        input => { input.sourceFiles['functions/_lib/identity/oauth-envelope.ts'] = input.sourceFiles['functions/_lib/identity/oauth-envelope.ts'].replace("name: 'AES-GCM'", "name: 'AES-CBC'"); },
        input => { input.workersTestSource = input.workersTestSource.replace(input.manifest.fixed_vectors.state_base64url, 'missing-vector'); },
        input => { delete input.evidenceSources['CF-EV-P3-SEC-002']; },
        input => { input.manifest.next_decision.remote_changes_authorized = true; }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase3IdentityPrimitives(input));
    }
});
