import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase5Exit } from './cloudflare-phase-5-exit-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-5');

validatePhase5Exit({
    manifest: json('config/cloudflare/phase-5-exit-gate.json'),
    evidenceSources: Object.fromEntries(fs.readdirSync(evidenceDirectory).filter(name => /^CF-EV-P5-.*\.md$/.test(name))
        .map(name => [name.replace(/\.md$/, ''), fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')])),
    storyContracts: {
        'CF-P5-001': json('config/cloudflare/phase-5-contract-freeze.json'),
        'CF-P5-002': json('config/cloudflare/phase-5-crypto-primitives.json'),
        'CF-P5-003': json('config/cloudflare/phase-5-device-key-lifecycle.json'),
        'CF-P5-004': json('config/cloudflare/phase-5-device-services.json'),
        'CF-P5-005': json('config/cloudflare/phase-5-workspace-keys.json'),
        'CF-P5-006': json('config/cloudflare/phase-5-rotation-recovery.json'),
        'CF-P5-007': json('config/cloudflare/phase-5-preview-key-foundation.json')
    },
    migrationManifest: json('migrations/manifest.json'),
    wrangler: json('wrangler.jsonc'),
    riskRegister: read('docs/collaboration-foundation/risk-register.md'),
    exitReport: read('docs/collaboration-foundation/phase-5-exit-report.md'),
    handoff: read('docs/collaboration-foundation/phase-6-handoff.md'),
    sprintSource: read('docs/collaboration-foundation/phase-5-sprint.md')
});

console.log('Cloudflare Phase 5 exit gate passed');
console.log('  Preview key foundation: GO; Phase 6 encrypted documents: PLAN-ONLY');
console.log('  Production identity, business routes, and collaboration activation: NO-GO');
console.log('  Sign-off: single-maintainer owner authorization (no independent review claimed)');
