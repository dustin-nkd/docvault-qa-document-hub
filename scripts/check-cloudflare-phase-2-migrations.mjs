import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2Migrations } from './cloudflare-phase-2-migration-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const migrationDirectory = path.join(root, 'migrations/collaboration');
const migrationSources = Object.fromEntries(fs.readdirSync(migrationDirectory)
    .filter(name => name.endsWith('.sql'))
    .map(name => [name, fs.readFileSync(path.join(migrationDirectory, name), 'utf8')]));

validatePhase2Migrations({
    manifest: JSON.parse(read('migrations/manifest.json')),
    migrationSources,
    freeze: JSON.parse(read('config/cloudflare/phase-2-schema-freeze.json')),
    wrangler: JSON.parse(read('wrangler.jsonc'))
});

console.log('Cloudflare Phase 2 immutable migration gate passed');
console.log('  Migrations: 6 frozen expansions + 4 approved hashed forward-only migrations');
console.log('  Schema 10: 18 STRICT tables including the CF-P3-007 rate-window control');
console.log('  Manifest, hash chain, columns, compatibility, append-only, and tenant guards: verified');
console.log('  Remote D1, binding, fixtures, protected plaintext, and collaboration: absent');
