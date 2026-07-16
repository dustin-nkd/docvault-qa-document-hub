import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2SchemaFreeze } from './cloudflare-phase-2-schema-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-2');
const evidenceSources = Object.fromEntries(fs.readdirSync(evidenceDirectory)
    .filter(name => /^CF-EV-P2-(STA|SEC)-001\.md$/.test(name))
    .map(name => [name.replace(/\.md$/, ''), fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')]));

validatePhase2SchemaFreeze({
    freeze: JSON.parse(read('config/cloudflare/phase-2-schema-freeze.json')),
    schemaDocument: read('docs/collaboration-foundation/phase-2-schema-freeze.md'),
    governanceDocument: read('docs/collaboration-foundation/phase-2-migration-governance.md'),
    evidenceSources,
    wrangler: JSON.parse(read('wrangler.jsonc')),
    migrationDirectoryExists: fs.existsSync(path.join(root, 'migrations/collaboration'))
});

console.log('Cloudflare Phase 2 schema freeze gate passed');
console.log('  Tables: 1 control + 14 entity tables frozen');
console.log('  Initial migrations: 6 governed expansion entries');
console.log('  Prohibited patterns: 10 fail-closed policies');
console.log('  Remote D1, binding, SQL migrations, and collaboration: absent');
console.log('  Gate P2-G1: review required');
