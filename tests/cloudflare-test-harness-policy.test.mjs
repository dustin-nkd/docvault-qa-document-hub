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

test('production Wrangler configuration contains only the reviewed preview D1 binding', () => {
    const config = JSON.parse(read('wrangler.jsonc'));
    assert.equal(config.env.preview.d1_databases.length, 1);
    assert.equal(config.env.preview.d1_databases[0].binding, 'COLLAB_DB');
    assert.equal(config.d1_databases, undefined);
    assert.equal(config.env.production.d1_databases, undefined);
    assert.doesNotMatch(read('wrangler.jsonc'), /preview_database_id|remote\s*:\s*true/);
});

test('disposable harness stays isolated from reviewed Foundation migrations and local state', () => {
    const migration = read('tests/cloudflare/migrations/0001_test_harness.sql');
    assert.match(migration, /disposable test harness only/i);
    assert.match(migration, /CREATE TABLE harness_records/);
    assert.match(read('.gitignore'), /^\.wrangler\/$/m);
    assert.equal(fs.existsSync(path.join(root, 'migrations/collaboration')), true);
    assert.equal(fs.existsSync(path.join(root, 'migrations/manifest.json')), true);
    assert.match(read('wrangler.jsonc'), /"migrations_dir": "migrations\/collaboration"/);
});
