import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase3SessionLifecycle } from '../scripts/cloudflare-phase-3-session-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-3-session-lifecycle.json'),
        sprintManifest: json('config/cloudflare/phase-3-sprint-plan.json'),
        sprintSource: read('docs/collaboration-foundation/phase-3-sprint.md'),
        contractSource: read('docs/collaboration-foundation/phase-3-identity-session-contract.md'),
        sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
        workersTestSource: read('tests/cloudflare/session-lifecycle.workers.test.ts'),
        routeSource: read('functions/api/v1/[[path]].ts'), wrangler: json('wrangler.jsonc'),
        migrationManifest: json('migrations/manifest.json'),
        evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
            read(`docs/collaboration-foundation/evidence/phase-3/${id}.md`)]))
    };
}

test('CF-P3-005 locks expiry, recent authentication, rotation, logout, retention, and disabled boundaries', () => {
    assert.equal(validatePhase3SessionLifecycle(actualInput()), true);
});

test('CF-P3-005 rejects digest, coalescing, recent-auth, rotation, logout, retention, and race drift', () => {
    for (const mutate of [
        input => { input.sourceFiles['functions/_lib/identity/session-service.ts'] = input.sourceFiles['functions/_lib/identity/session-service.ts'].replace('const RECENT_AUTH_MS = 900_000', 'const RECENT_AUTH_MS = 9_000_000'); },
        input => { input.sourceFiles['functions/_lib/identity/session-service.ts'] = input.sourceFiles['functions/_lib/identity/session-service.ts'].replace('const LAST_SEEN_COALESCE_MS = 300_000', 'const LAST_SEEN_COALESCE_MS = 30_000'); },
        input => { input.sourceFiles['functions/_lib/identity/session-repository.ts'] = input.sourceFiles['functions/_lib/identity/session-repository.ts'].replace('WHERE changes() <> 1', 'WHERE changes() < 0'); },
        input => { input.sourceFiles['functions/_lib/identity/session-repository.ts'] = input.sourceFiles['functions/_lib/identity/session-repository.ts'].replace("revoke_reason = 'logout'", "revoke_reason = 'later'"); },
        input => { input.sourceFiles['functions/_lib/persistence/retention.ts'] = input.sourceFiles['functions/_lib/persistence/retention.ts'].replace('ORDER BY absolute_expires_at, id LIMIT ?', 'ORDER BY absolute_expires_at, id LIMIT 10000'); },
        input => { input.workersTestSource = input.workersTestSource.replace('exactly one concurrent security rotation', 'missing rotation race'); }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase3SessionLifecycle(input));
    }
});

test('CF-P3-005 rejects route, migration, secret, activation, evidence, and gate drift', () => {
    for (const mutate of [
        input => { input.migrationManifest.entries.push({ version: 10 }); },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { input.manifest.scope.preview_identity_enabled = true; },
        input => { delete input.evidenceSources['CF-EV-P3-SEC-005']; },
        input => { input.manifest.gate_authorization.id = 'P3-G2A'; },
        input => { input.manifest.next_decision.remote_changes_authorized = true; }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase3SessionLifecycle(input));
    }
});
