import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase3RequestPolicy } from '../scripts/cloudflare-phase-3-request-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-3-request-policy.json'),
        sprintManifest: json('config/cloudflare/phase-3-sprint-plan.json'),
        sprintSource: read('docs/collaboration-foundation/phase-3-sprint.md'),
        contractSource: read('docs/collaboration-foundation/phase-3-identity-session-contract.md'),
        sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
        workersTestSource: read('tests/cloudflare/identity-request-policy.workers.test.ts'),
        routeSource: read('functions/api/v1/[[path]].ts'), wrangler: json('wrangler.jsonc'),
        migrationManifest: json('migrations/manifest.json'),
        evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
            read(`docs/collaboration-foundation/evidence/phase-3/${id}.md`)]))
    };
}

test('CF-P3-006 locks Origin, CSRF, four-route, cache, CORS, and activation boundaries', () => {
    assert.equal(validatePhase3RequestPolicy(actualInput()), true);
});

test('CF-P3-006 rejects route, Origin, CSRF, response, and test-coverage drift', () => {
    for (const mutate of [
        input => { input.sourceFiles['functions/_lib/identity/request-policy.ts'] = input.sourceFiles['functions/_lib/identity/request-policy.ts'].replace("request.headers.get('Origin') !== expectedOrigin", 'false'); },
        input => { input.sourceFiles['functions/_lib/identity/request-policy.ts'] = input.sourceFiles['functions/_lib/identity/request-policy.ts'].replace('verifyCsrfToken(input.csrfTokenKey', 'verifyCsrfToken(input.sessionTokenPepper'); },
        input => { input.sourceFiles['functions/_lib/identity/request-policy.ts'] += '\nconst x = "Access-Control-Allow-Origin";'; },
        input => { input.manifest.route_scope.push('GET /api/v1/workspaces'); },
        input => { input.workersTestSource = input.workersTestSource.replace('old-key, and cross-session CSRF', 'missing csrf coverage'); }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase3RequestPolicy(input));
    }
});

test('CF-P3-006 rejects route activation, migration, binding, evidence, and gate drift', () => {
    for (const mutate of [
        input => { input.routeSource += '\nauthorizeIdentityRequest();'; },
        input => { input.migrationManifest.entries.push({ version: 10 }); },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { input.manifest.scope.preview_identity_enabled = true; },
        input => { delete input.evidenceSources['CF-EV-P3-SEC-006']; },
        input => { input.manifest.gate_authorization.id = 'P3-G2B'; },
        input => { input.manifest.next_decision.remote_changes_authorized = true; }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase3RequestPolicy(input));
    }
});
