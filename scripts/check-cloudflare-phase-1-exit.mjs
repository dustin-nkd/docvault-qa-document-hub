import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase1ExitGate } from './cloudflare-phase-1-exit-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const manifest = JSON.parse(read('config/cloudflare/phase-1-exit-gate.json'));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-1');
const evidenceSources = Object.fromEntries(fs.readdirSync(evidenceDirectory)
    .filter(name => /^CF-EV-P1-.*\.md$/.test(name))
    .map(name => [name.replace(/\.md$/, ''), fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')]));

validatePhase1ExitGate({
    manifest,
    evidenceSources,
    packageJson: JSON.parse(read('package.json')),
    wrangler: JSON.parse(read('wrangler.jsonc')),
    configurationDiff: JSON.parse(read('config/cloudflare/pages-wrangler-diff.json')),
    riskRegister: read('docs/collaboration-foundation/risk-register.md'),
    exitReport: read('docs/collaboration-foundation/phase-1-exit-report.md')
});

console.log('Cloudflare Phase 1 exit gate passed');
console.log('  Stories: 9 PASS');
console.log('  Evidence records:', Object.keys(evidenceSources).length, 'PASS');
console.log('  P0/P1 exceptions and open defects: zero');
console.log('  Remote bindings and collaboration data: absent');
console.log('  Phase 2 implementation: GO');
console.log('  Collaboration activation: NO-GO');
