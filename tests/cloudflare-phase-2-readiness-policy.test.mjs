import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2LocalReadiness } from '../scripts/cloudflare-phase-2-readiness-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function actualInput() {
    const readiness = JSON.parse(read('config/cloudflare/phase-2-local-readiness.json'));
    const migrationDirectory = path.join(root, 'migrations/collaboration');
    return {
        readiness,
        querySource: read('functions/_lib/collaboration-query-contract.ts'),
        migrationSources: Object.fromEntries(fs.readdirSync(migrationDirectory)
            .filter(name => name.endsWith('.sql'))
            .map(name => [name, fs.readFileSync(path.join(migrationDirectory, name), 'utf8')])),
        evidenceSources: Object.fromEntries(readiness.evidence.map(id => [
            id,
            read(`docs/collaboration-foundation/evidence/phase-2/${id}.md`)
        ])),
        wrangler: JSON.parse(read('wrangler.jsonc'))
    };
}

// NO-OP CONTROL. The unmutated real repository input must validate. If this ever fails,
// every assert.throws below passes for the wrong reason and this suite proves nothing.
test('CF-P2-003 locks tenant constraints, keyset queries, index plans, and the local-only boundary', () => {
    assert.equal(validatePhase2LocalReadiness(actualInput()), true);
});
test('CF-P2-003 rejects unsafe query source and missing tenant/index controls', () => {
    const cases = [
        input => { input.querySource = input.querySource.replace('SELECT id, user_id', 'SELECT *'); },
        input => { input.querySource = input.querySource.replace('LIMIT ?', 'LIMIT ? OFFSET ?'); },
        input => { input.querySource = input.querySource.replace('workspace_id = ? AND id = ?', 'id = ?'); },
        input => { input.querySource = input.querySource.replace("stableKeyset: ['updated_at', 'id']", 'stableKeyset: []'); },
        input => { input.migrationSources[Object.keys(input.migrationSources).find(name => name.startsWith('0007_'))] = ''; },
        input => { input.readiness.required_indexes.pop(); },
        input => { input.readiness.tenant_guard_triggers.pop(); }
    ];
    for (const mutate of cases) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase2LocalReadiness(input));
    }
});

test('CF-P2-003 rejects gate approval drift, remote state, activation, and evidence drift', () => {
    // NO-OP CONTROL for this case table: the unmutated input must NOT throw, so that each
    // assert.throws below is attributable to its own mutation rather than to ambient failure.
    assert.doesNotThrow(() => validatePhase2LocalReadiness(actualInput()));
    const cases = [
        input => { input.readiness.gate_candidate.decision = 'REVIEW_REQUIRED'; },
        input => { input.wrangler.d1_databases = [{ binding: 'COLLAB_DB', database_id: 'forbidden' }]; },
        // D-P7-01 (approved 2026-07-26) activates collaboration for PREVIEW ONLY.
        // Production must never activate — this is the boundary that has to survive.
        input => { input.wrangler.env.production.vars.COLLABORATION_ENABLED = 'true'; },
        // D-P7-01: the top-level vars default must never activate collaboration either.
        input => { input.wrangler.vars.COLLABORATION_ENABLED = 'true'; },
        // D-P7-01: preview activation is the authorized state; silently reverting it is drift.
        input => { input.wrangler.env.preview.vars.COLLABORATION_ENABLED = 'false'; },
        input => { delete input.evidenceSources['CF-EV-P2-SEC-003']; }
    ];
    for (const mutate of cases) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase2LocalReadiness(input));
    }
});
