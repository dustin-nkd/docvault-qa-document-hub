import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase4Exit } from './cloudflare-phase-4-exit-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-4');

validatePhase4Exit({
    manifest: json('config/cloudflare/phase-4-exit-gate.json'),
    evidenceSources: Object.fromEntries(fs.readdirSync(evidenceDirectory).filter(name => /^CF-EV-P4-.*\.md$/.test(name))
        .map(name => [name.replace(/\.md$/, ''), fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')])),
    storyContracts: {
        'CF-P4-001': json('config/cloudflare/phase-4-contract-freeze.json'),
        'CF-P4-002': json('config/cloudflare/phase-4-workspace-bootstrap.json'),
        'CF-P4-003': json('config/cloudflare/phase-4-central-rbac.json'),
        'CF-P4-004': json('config/cloudflare/phase-4-invitation-lifecycle.json'),
        'CF-P4-005': json('config/cloudflare/phase-4-membership-administration.json'),
        'CF-P4-006': json('config/cloudflare/phase-4-audit-scoped-reads.json'),
        'CF-P4-007': json('config/cloudflare/phase-4-preview-api-integration.json')
    },
    migrationManifest: json('migrations/manifest.json'), wrangler: json('wrangler.jsonc'),
    packageJson: json('package.json'), riskRegister: read('docs/collaboration-foundation/risk-register.md'),
    exitReport: read('docs/collaboration-foundation/phase-4-exit-report.md'),
    handoff: read('docs/collaboration-foundation/phase-5-handoff.md')
});

console.log('Cloudflare Phase 4 exit gate passed');
console.log('  Preview control plane: GO; Phase 5 device keys and E2EE: GO');
console.log('  Production identity, business routes, and collaboration activation: NO-GO');
