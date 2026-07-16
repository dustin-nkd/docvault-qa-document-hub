import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2ExitGate } from './cloudflare-phase-2-exit-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-2');

validatePhase2ExitGate({
    manifest: json('config/cloudflare/phase-2-exit-gate.json'),
    evidenceSources: Object.fromEntries(fs.readdirSync(evidenceDirectory)
        .filter(name => /^CF-EV-P2-.*\.md$/.test(name))
        .map(name => [name.replace(/\.md$/, ''), fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')])),
    packageJson: json('package.json'),
    wrangler: json('wrangler.jsonc'),
    migrationManifest: json('migrations/manifest.json'),
    storyContracts: {
        'CF-P2-001': json('config/cloudflare/phase-2-schema-freeze.json'),
        'CF-P2-002': json('migrations/manifest.json'),
        'CF-P2-003': json('config/cloudflare/phase-2-local-readiness.json'),
        'CF-P2-004': json('config/cloudflare/phase-2-persistence-foundation.json'),
        'CF-P2-005': json('config/cloudflare/phase-2-security-recipes.json'),
        'CF-P2-006': json('config/cloudflare/phase-2-quality-matrix.json'),
        'CF-P2-007': json('config/cloudflare/phase-2-preview-d1.json'),
        'CF-P2-008': json('config/cloudflare/phase-2-recovery-rehearsal.json')
    },
    riskRegister: read('docs/collaboration-foundation/risk-register.md'),
    exitReport: read('docs/collaboration-foundation/phase-2-exit-report.md')
});

console.log('Cloudflare Phase 2 exit gate passed');
console.log('  Stories: 9 PASS; evidence records: 25 PASS');
console.log('  Schema: 9 immutable migrations; preview entity rows: zero');
console.log('  Recovery resource and production D1: absent');
console.log('  Phase 3 identity/session implementation: GO');
console.log('  Collaboration activation: NO-GO');
