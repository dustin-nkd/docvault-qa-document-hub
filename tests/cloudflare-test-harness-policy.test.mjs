import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Workers Vitest harness is local-only, disposable, and network denied', () => {
    const config = read('vitest.config.mts');
    assert.match(config, /wrangler:\s*\{\s*configPath:\s*['"]\.\/wrangler\.jsonc['"]/);
    assert.match(config, /remoteBindings:\s*false/);
    assert.match(config, /d1Databases:\s*\[['"]COLLAB_DB['"]\]/);
    assert.match(config, /d1Persist:\s*false/);
    assert.match(config, /outboundService:\s*\(\)\s*=>\s*new Response/);
    assert.doesNotMatch(config, /database_id|databaseId|remote\s*:\s*true|CLOUDFLARE_API_TOKEN/);
});

test('production Wrangler configuration contains no test D1 binding or remote resource ID', () => {
    const source = read('wrangler.jsonc');
    assert.doesNotMatch(source, /COLLAB_DB|d1_databases|database_id|preview_database_id|remote\s*:\s*true/);
});

test('disposable migration is test-scoped and cannot persist in repository state', () => {
    const migration = read('tests/cloudflare/migrations/0001_test_harness.sql');
    assert.match(migration, /disposable test harness only/i);
    assert.match(migration, /CREATE TABLE harness_records/);
    assert.match(read('.gitignore'), /^\.wrangler\/$/m);
    assert.equal(fs.existsSync(path.join(root, 'migrations')), false);
});
