import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2LocalReadiness } from './cloudflare-phase-2-readiness-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const migrationDirectory = path.join(root, 'migrations/collaboration');
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-2');
const readiness = JSON.parse(read('config/cloudflare/phase-2-local-readiness.json'));

validatePhase2LocalReadiness({
    readiness,
    querySource: read('functions/_lib/collaboration-query-contract.ts'),
    migrationSources: Object.fromEntries(fs.readdirSync(migrationDirectory)
        .filter(name => name.endsWith('.sql'))
        .map(name => [name, fs.readFileSync(path.join(migrationDirectory, name), 'utf8')])),
    evidenceSources: Object.fromEntries(readiness.evidence.map(id => [id, read(`docs/collaboration-foundation/evidence/phase-2/${id}.md`)])),
    wrangler: JSON.parse(read('wrangler.jsonc'))
});

console.log('Cloudflare Phase 2 local schema readiness gate passed');
console.log('  Constraint domains: 11 fail-closed matrices');
console.log('  Query contracts: 13 prepared, explicit, bounded, keyset-scoped plans');
console.log('  Representative workload: 10,000 documents + 50 hot-document revisions');
console.log('  Tenant guards and intended index plans: verified locally');
console.log('  Gate P2-G2: APPROVED for CF-P2-004; remote D1 and collaboration remain disabled');
