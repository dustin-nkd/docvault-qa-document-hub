import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Contract } from './cloudflare-phase-7-contract-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase7Contract({
    contract: JSON.parse(read('config/cloudflare/phase-7-ui-contract.json')),
    contractSource: read('docs/collaboration-foundation/phase-7-ui-contract.md'),
    plan: JSON.parse(read('config/cloudflare/phase-7-sprint-plan.json')),
    conflictSource: read('js/collaboration/conflict-resolution.js'),
    outboxSource: read('js/collaboration/outbox.js'),
    documentServiceSource: read('functions/_lib/documents/document-service.ts')
});

console.log('Cloudflare Phase 7 UI contract gate passed');
console.log('  CF-P7-001: FROZEN; P7-G1 authorizes CF-P7-002 only');
console.log('  Twelve surfaces owned, five-state sync machine closed and reachable');
console.log('  Server error taxonomy fully mapped; inherited vocabularies match the code');
console.log('  WCAG 2.2 AA, 320 px floor, and personal/workspace separation pinned');
