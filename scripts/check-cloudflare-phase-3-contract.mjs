import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase3ContractFreeze } from './cloudflare-phase-3-contract-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-3');

validatePhase3ContractFreeze({
    manifest: json('config/cloudflare/phase-3-contract-freeze.json'),
    sprintManifest: json('config/cloudflare/phase-3-sprint-plan.json'),
    sprintSource: read('docs/collaboration-foundation/phase-3-sprint.md'),
    contractSource: read('docs/collaboration-foundation/phase-3-identity-session-contract.md'),
    evidenceSources: Object.fromEntries(fs.readdirSync(evidenceDirectory).filter(name => /^CF-EV-P3-(STA|SEC)-001\.md$/.test(name))
        .map(name => [name.replace(/\.md$/, ''), fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')])),
    wrangler: json('wrangler.jsonc'),
    branchControl: json('config/cloudflare/pages-branch-control.json'),
    migrationManifest: json('migrations/manifest.json'),
    wranglerSchema: json('node_modules/wrangler/config-schema.json'),
    gitignore: read('.gitignore'),
    operationalRunbook: read('docs/collaboration-foundation/operational-runbook.md')
});

console.log('Cloudflare Phase 3 identity/session contract freeze passed');
console.log('  CF-P3-001: PASS; evidence: STA-001 and SEC-001');
console.log('  Runtime/schema/remote changes: zero');
console.log('  Contract remains frozen; CF-P3-002 implementation is tracked by its separate gate');
