import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase4CentralRbac } from '../scripts/cloudflare-phase-4-central-rbac-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-4-central-rbac.json'),
        prerequisite: json('config/cloudflare/phase-4-workspace-bootstrap.json'),
        sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
        workersTestSource: read('tests/cloudflare/central-rbac-policy.workers.test.ts'),
        routeSource: read('functions/api/v1/[[path]].ts'),
        wrangler: json('wrangler.jsonc'),
        migrationManifest: json('migrations/manifest.json'),
        evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
            read(`docs/collaboration-foundation/evidence/phase-4/${id}.md`)]))
    };
}

test('CF-P4-003 locks central deny-by-default RBAC, live D1 authority, and isolation', () => {
    assert.equal(validatePhase4CentralRbac(actualInput()), true);
});

test('CF-P4-003 rejects action, ceiling, last-Owner, and live-authority drift', () => {
    for (const mutate of [
        input => { input.manifest.policy.actions.pop(); },
        input => { input.sourceFiles['functions/_lib/rbac/policy.ts'] = input.sourceFiles['functions/_lib/rbac/policy.ts'].replace("deny('LAST_OWNER_REQUIRED')", "decision(true, 'ALLOWED')"); },
        input => { input.sourceFiles['functions/_lib/rbac/repository.ts'] = input.sourceFiles['functions/_lib/rbac/repository.ts'].replace('openAuthorizationSession(database)', 'database'); },
        input => { input.workersTestSource = input.workersTestSource.replace('Admin target ceilings', 'ceiling omitted'); }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase4CentralRbac(input));
    }
});

test('CF-P4-003 rejects route, migration, activation, evidence, and authorization drift', () => {
    for (const mutate of [
        input => { input.routeSource += "\nimport { authorizeWorkspaceAction } from '../../_lib/rbac';"; },
        input => { input.migrationManifest.entries.push({ sequence: 11 }); },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { delete input.evidenceSources['CF-EV-P4-SEC-003']; },
        input => { input.manifest.gate_authorization.id = 'P4-G1'; }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase4CentralRbac(input));
    }
});
