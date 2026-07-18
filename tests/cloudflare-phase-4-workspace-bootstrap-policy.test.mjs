import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase4WorkspaceBootstrap } from '../scripts/cloudflare-phase-4-workspace-bootstrap-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-4-workspace-bootstrap.json'),
        contract: json('config/cloudflare/phase-4-contract-freeze.json'),
        sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
        workersTestSource: read('tests/cloudflare/workspace-bootstrap.workers.test.ts'),
        routeSource: read('functions/api/v1/[[path]].ts'),
        wrangler: json('wrangler.jsonc'),
        migrationManifest: json('migrations/manifest.json'),
        evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
            read(`docs/collaboration-foundation/evidence/phase-4/${id}.md`)]))
    };
}

test('CF-P4-002 locks atomic bootstrap, idempotency, Owner, audit, and deferred key boundaries', () => {
    assert.equal(validatePhase4WorkspaceBootstrap(actualInput()), true);
});

test('CF-P4-002 rejects recipe, validation, and race coverage drift', () => {
    for (const mutate of [
        input => { input.sourceFiles['functions/_lib/persistence/mutation-recipes.ts'] = input.sourceFiles['functions/_lib/persistence/mutation-recipes.ts'].replace("'active', 1", "'active', 2"); },
        input => { input.sourceFiles['functions/_lib/workspaces/workspace-bootstrap.ts'] = input.sourceFiles['functions/_lib/workspaces/workspace-bootstrap.ts'].replace('validateInput(input);', ''); },
        input => { input.workersTestSource = input.workersTestSource.replace('distinct mutations race for the same workspace', 'race omitted'); }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase4WorkspaceBootstrap(input));
    }
});

test('CF-P4-002 rejects route, migration, activation, evidence, and authorization drift', () => {
    for (const mutate of [
        input => { input.routeSource += "\nimport { bootstrapWorkspace } from '../../_lib/workspaces';"; },
        input => { input.migrationManifest.entries.push({ sequence: 11 }); },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { delete input.evidenceSources['CF-EV-P4-SEC-002']; },
        input => { input.manifest.gate_authorization.id = 'P4-G0'; }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase4WorkspaceBootstrap(input));
    }
});
