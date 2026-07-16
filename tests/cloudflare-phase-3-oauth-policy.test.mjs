import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase3OAuthTransactions } from '../scripts/cloudflare-phase-3-oauth-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-3-oauth-transactions.json'),
        sprintManifest: json('config/cloudflare/phase-3-sprint-plan.json'),
        sprintSource: read('docs/collaboration-foundation/phase-3-sprint.md'),
        contractSource: read('docs/collaboration-foundation/phase-3-identity-session-contract.md'),
        sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
        workersTestSource: read('tests/cloudflare/oauth-transaction-lifecycle.workers.test.ts'),
        routeSource: read('functions/api/v1/[[path]].ts'), wrangler: json('wrangler.jsonc'),
        migrationManifest: json('migrations/manifest.json'),
        evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
            read(`docs/collaboration-foundation/evidence/phase-3/${id}.md`)]))
    };
}

test('CF-P3-003 locks the single-use lifecycle, evidence, and disabled boundaries', () => {
    assert.equal(validatePhase3OAuthTransactions(actualInput()), true);
});

test('CF-P3-003 rejects CAS, expiry, test, route, schema, binding, and activation drift', () => {
    for (const mutate of [
        input => { input.sourceFiles['functions/_lib/identity/oauth-transaction-repository.ts'] = input.sourceFiles['functions/_lib/identity/oauth-transaction-repository.ts'].replace('expires_at > ?', 'expires_at >= ?'); },
        input => { input.sourceFiles['functions/_lib/identity/oauth-transaction-service.ts'] = input.sourceFiles['functions/_lib/identity/oauth-transaction-service.ts'].replace('600_000', '900_000'); },
        input => { input.workersTestSource = input.workersTestSource.replace('exactly one concurrent consume', 'missing concurrent coverage'); },
        input => { input.migrationManifest.entries.push({ version: 10 }); },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { input.manifest.scope.identity_enabled = true; }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase3OAuthTransactions(input));
    }
});

test('CF-P3-003 rejects evidence, gate, remote-write, and protected-value logging drift', () => {
    for (const mutate of [
        input => { delete input.evidenceSources['CF-EV-P3-SEC-003']; },
        input => { input.manifest.gate_authorization.id = 'P3-G1'; },
        input => { input.manifest.scope.remote_writes = 1; },
        input => { input.sourceFiles['functions/_lib/identity/oauth-transaction-service.ts'] += '\nconsole.log(state);'; },
        input => { input.manifest.next_decision.remote_changes_authorized = true; }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase3OAuthTransactions(input));
    }
});
