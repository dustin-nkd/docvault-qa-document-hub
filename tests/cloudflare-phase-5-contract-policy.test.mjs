import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase5ContractFreeze } from '../scripts/cloudflare-phase-5-contract-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const input = () => ({
    contract: json('config/cloudflare/phase-5-contract-freeze.json'),
    sprint: json('config/cloudflare/phase-5-sprint-plan.json'),
    apiContract: read('docs/collaboration-foundation/api-contract.md'),
    schemaContract: read('docs/collaboration-foundation/schema-contract.md'),
    cryptoContract: read('docs/collaboration-foundation/crypto-contract.md'),
    freezeSource: read('docs/collaboration-foundation/phase-5-key-contract-freeze.md'),
    stabilityEvidence: read('docs/collaboration-foundation/evidence/phase-5/CF-EV-P5-STA-001.md'),
    securityEvidence: read('docs/collaboration-foundation/evidence/phase-5/CF-EV-P5-SEC-001.md'),
    migrations: json('migrations/manifest.json'),
    runtimeSource: read('functions/_lib/collaboration/runtime-handler.ts')
});

test('CF-P5-001 freezes bootstrap, provisioning, rotation, vectors, and authorization ceilings', () => {
    assert.equal(validatePhase5ContractFreeze(input()), true);
});

test('CF-P5-001 rejects weaker authority, mutable rotation, vector loss, migration, and runtime pull-forward', () => {
    for (const mutate of [
        value => { value.contract.provisioning_authority.wrapper_roles.push('editor'); },
        value => { value.contract.rotation_schema.schema_10_sufficient = true; },
        value => { value.contract.rotation_schema.invariants.pop(); },
        value => { value.contract.vector_contract.families[0].cases.pop(); },
        value => { value.contract.authorization_boundary.preview_deploy = true; },
        value => { value.migrations.entries.push({ sequence: 11 }); },
        value => { value.runtimeSource += '\nworkspaces/bootstrap-intents'; }
    ]) {
        const value = input(); mutate(value);
        assert.throws(() => validatePhase5ContractFreeze(value));
    }
});
