import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase3OAuthCallback } from '../scripts/cloudflare-phase-3-callback-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-3-oauth-callback.json'),
        sprintManifest: json('config/cloudflare/phase-3-sprint-plan.json'),
        sprintSource: read('docs/collaboration-foundation/phase-3-sprint.md'),
        contractSource: read('docs/collaboration-foundation/phase-3-identity-session-contract.md'),
        sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
        workersTestSource: read('tests/cloudflare/oauth-callback.workers.test.ts'),
        routeSource: read('functions/api/v1/[[path]].ts'), wrangler: json('wrangler.jsonc'),
        migrationManifest: json('migrations/manifest.json'),
        evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
            read(`docs/collaboration-foundation/evidence/phase-3/${id}.md`)]))
    };
}

test('CF-P3-004 locks provider, numeric identity, atomic rollback, evidence, and disabled boundaries', () => {
    assert.equal(validatePhase3OAuthCallback(actualInput()), true);
});

test('CF-P3-004 rejects endpoint, timeout, retry, body-limit, CAS, digest, and race coverage drift', () => {
    for (const mutate of [
        input => { input.sourceFiles['functions/_lib/identity/github-oauth-adapter.ts'] = input.sourceFiles['functions/_lib/identity/github-oauth-adapter.ts'].replace('api.github.com/user', 'attacker.example/user'); },
        input => { input.sourceFiles['functions/_lib/identity/github-oauth-adapter.ts'] = input.sourceFiles['functions/_lib/identity/github-oauth-adapter.ts'].replace('const OVERALL_BUDGET_MS = 8_000', 'const OVERALL_BUDGET_MS = 80_000'); },
        input => { input.sourceFiles['functions/_lib/identity/oauth-callback-repository.ts'] = input.sourceFiles['functions/_lib/identity/oauth-callback-repository.ts'].replace('WHERE changes() <> 1', 'WHERE changes() < 0'); },
        input => { input.sourceFiles['functions/_lib/identity/oauth-callback-service.ts'] = input.sourceFiles['functions/_lib/identity/oauth-callback-service.ts'].replace('digestSessionToken(input.sessionTokenPepper, sessionToken)', 'sessionToken') },
        input => { input.workersTestSource = input.workersTestSource.replace('exactly one concurrent callback', 'missing race coverage'); }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase3OAuthCallback(input));
    }
});

test('CF-P3-004 rejects route, migration, secret, activation, evidence, and gate drift', () => {
    for (const mutate of [
        input => { input.routeSource += '\ncompleteOAuthCallback();'; },
        input => { input.migrationManifest.entries.push({ version: 10 }); },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { input.manifest.scope.preview_identity_enabled = true; },
        input => { delete input.evidenceSources['CF-EV-P3-SEC-004']; },
        input => { input.manifest.gate_authorization.id = 'P3-G2'; },
        input => { input.manifest.next_decision.remote_changes_authorized = true; }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase3OAuthCallback(input));
    }
});
