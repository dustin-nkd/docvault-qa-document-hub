import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2SchemaFreeze } from '../scripts/cloudflare-phase-2-schema-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function actualInput() {
    const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-2');
    return {
        freeze: JSON.parse(read('config/cloudflare/phase-2-schema-freeze.json')),
        schemaDocument: read('docs/collaboration-foundation/phase-2-schema-freeze.md'),
        governanceDocument: read('docs/collaboration-foundation/phase-2-migration-governance.md'),
        evidenceSources: Object.fromEntries(fs.readdirSync(evidenceDirectory)
            .filter(name => /^CF-EV-P2-(STA|SEC)-001\.md$/.test(name))
            .map(name => [name.replace(/\.md$/, ''), fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')])),
        wrangler: JSON.parse(read('wrangler.jsonc')),
        migrationDirectoryExists: false
    };
}

test('CF-P2-001 freezes the exact schema and migration governance without remote state', () => {
    assert.equal(validatePhase2SchemaFreeze(actualInput()), true);
});
test('CF-P2-001 rejects table, column, migration, prohibition, and evidence drift', () => {
    const cases = [
        input => { input.freeze.tables.pop(); },
        input => { input.freeze.tables.find(table => table.name === 'sessions').columns.push('raw_token'); },
        input => { input.freeze.migration_sequence[1].owns.push('users'); },
        input => { input.freeze.prohibited_patterns.pop(); },
        input => { delete input.evidenceSources['CF-EV-P2-SEC-001']; }
    ];
    for (const mutate of cases) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase2SchemaFreeze(input));
    }
});

test('CF-P2-001 rejects premature SQL, remote binding, activation, and gate approval', () => {
    const cases = [
        input => { input.migrationDirectoryExists = true; },
        input => { input.wrangler.d1_databases = [{ binding: 'COLLAB_DB', database_id: 'forbidden' }]; },
        input => { input.freeze.environment_boundary.collaboration_enabled = true; },
        input => { input.freeze.gate.decision = 'PASS'; }
    ];
    for (const mutate of cases) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase2SchemaFreeze(input));
    }
});
