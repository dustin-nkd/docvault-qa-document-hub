import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase5ContractFreeze } from './cloudflare-phase-5-contract-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

validatePhase5ContractFreeze({
    contract: json('config/cloudflare/phase-5-contract-freeze.json'),
    sprint: json('config/cloudflare/phase-5-sprint-plan.json'),
    apiContract: read('docs/collaboration-foundation/api-contract.md'),
    schemaContract: read('docs/collaboration-foundation/schema-contract.md'),
    cryptoContract: read('docs/collaboration-foundation/crypto-contract.md'),
    freezeSource: read('docs/collaboration-foundation/phase-5-key-contract-freeze.md'),
    stabilityEvidence: read('docs/collaboration-foundation/evidence/phase-5/CF-EV-P5-STA-001.md'),
    securityEvidence: read('docs/collaboration-foundation/evidence/phase-5/CF-EV-P5-SEC-001.md'),
    migrations: json('migrations/manifest.json'),
    runtimeSource: read('functions/_lib/collaboration/runtime-handler.ts')
});

console.log('Cloudflare CF-P5-001 contract freeze passed');
console.log('  Bootstrap: stateless intent then atomic workspace/key/envelope creation');
console.log('  Rotation: additive sequence 11 required, not authorized or created');
console.log('  Next: P5-G1 may authorize CF-P5-002 only');
