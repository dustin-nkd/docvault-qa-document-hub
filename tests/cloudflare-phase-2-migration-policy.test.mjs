import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    validateAppliedMigrationNames,
    validatePhase2Migrations
} from '../scripts/cloudflare-phase-2-migration-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function actualInput() {
    const directory = path.join(root, 'migrations/collaboration');
    return {
        manifest: JSON.parse(read('migrations/manifest.json')),
        migrationSources: Object.fromEntries(fs.readdirSync(directory)
            .filter(name => name.endsWith('.sql'))
            .map(name => [name, fs.readFileSync(path.join(directory, name), 'utf8')])),
        freeze: JSON.parse(read('config/cloudflare/phase-2-schema-freeze.json')),
        wrangler: JSON.parse(read('wrangler.jsonc'))
    };
}

test('CF-P2-002 verifies immutable hashes, sequence, schema columns, and local-only policy', () => {
    assert.equal(validatePhase2Migrations(actualInput()), true);
});

test('CF-P2-002 rejects edits, gaps, duplicates, ownership drift, destructive SQL, and remote state', () => {
    const cases = [
        input => { input.migrationSources[input.manifest.entries[0].filename] += '\n-- edited'; },
        input => { input.manifest.entries.splice(2, 1); },
        input => { input.manifest.entries[1].sequence = 1; },
        input => { input.manifest.entries[3].tables.push('users'); },
        input => { input.migrationSources[input.manifest.entries[5].filename] += '\nDROP TABLE users;'; },
        input => { input.wrangler.d1_databases = [{ binding: 'COLLAB_DB', database_id: 'forbidden' }]; },
        input => { input.wrangler.env.production.vars.COLLABORATION_ENABLED = 'true'; }
    ];
    for (const mutate of cases) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase2Migrations(input));
    }
});

test('CF-P2-002 rejects unknown, reordered, duplicate, missing, and changed applied history', () => {
    const manifest = actualInput().manifest;
    const names = manifest.entries.map(entry => entry.filename);
    assert.equal(validateAppliedMigrationNames([], manifest), true);
    assert.equal(validateAppliedMigrationNames(names.slice(0, 3), manifest), true);
    assert.equal(validateAppliedMigrationNames(names, manifest, { requireComplete: true }), true);
    assert.throws(() => validateAppliedMigrationNames([names[1]], manifest), /unknown|reordered|gap/);
    assert.throws(() => validateAppliedMigrationNames([names[0], names[0]], manifest), /duplicates/);
    assert.throws(() => validateAppliedMigrationNames([...names, '9999_unknown.sql'], manifest), /unknown/);
    assert.throws(() => validateAppliedMigrationNames(names.slice(0, 5), manifest, { requireComplete: true }), /incomplete/);
    assert.throws(() => validateAppliedMigrationNames([names[0].replace(/_[a-f0-9]{12}_/, '_000000000000_')], manifest), /unknown|reordered|gap/);
});

test('CF-P2-002 typed row contracts cover every frozen table without unsafe double casts', () => {
    const source = read('functions/_lib/collaboration-schema.ts');
    const freeze = actualInput().freeze;
    assert.doesNotMatch(source, /as\s+unknown\s+as|:\s*any\b|<any>/);
    assert.match(source, /COLLABORATION_SCHEMA_VERSION\s*=\s*9\s+as const/);
    assert.match(source, /type CollaborationWriteResult = D1Result/);
    for (const table of freeze.tables) assert.match(source, new RegExp(`\\b${table.name}:`), `${table.name} lacks a typed row map`);
    assert.match(source, /\btransition_guards:\s*TransitionGuardRow/);
    assert.match(source, /\bretention_purge_runs:\s*RetentionPurgeRunRow/);
});
