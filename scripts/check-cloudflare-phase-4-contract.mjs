import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const contract = JSON.parse(read('config/cloudflare/phase-4-contract-freeze.json'));
const wrangler = JSON.parse(read('wrangler.jsonc'));
const assert = (value, message) => { if (!value) throw new Error(message); };
const same = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
assert(contract.phase === 'CF-P4' && contract.story === 'CF-P4-001' && contract.status === 'PASS', 'Phase 4 contract identity drifted');
assert(contract.gate_authorization?.id === 'P4-G0' && contract.gate_authorization.decision === 'APPROVED' && contract.gate_authorization.next_gate === 'P4-G1', 'P4 authorization drifted');
assert(same(contract.roles, ['owner','admin','editor','viewer']) && same(contract.principal_states, ['active','pending_key','removed','revoked_device','unauthenticated','guest']), 'Role/state matrix drifted');
assert(contract.invitations?.token_bits === 256 && contract.invitations.storage === 'hash-only' && contract.invitations.expiry_hours === 72 && contract.invitations.single_use && contract.invitations.revocable && contract.invitations.accepted_membership_state === 'pending_key', 'Invitation contract drifted');
assert(contract.invariants?.length === 5 && contract.deferred?.length === 5, 'Invariant or scope boundary drifted');
assert(Object.values(contract.boundaries || {}).every(value => value === false || value === 0), 'Phase 4 contract activated a boundary');
assert(!wrangler.d1_databases && !wrangler.env?.production?.d1_databases && [wrangler.vars,wrangler.env?.preview?.vars,wrangler.env?.production?.vars].every(v=>v?.COLLABORATION_ENABLED==='false'), 'Runtime boundary drifted');
for (const id of contract.evidence) { const source = read(`docs/collaboration-foundation/evidence/phase-4/${id}.md`); assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source) && source.includes('CF-P4-001'), `${id} evidence drifted`); }
console.log('Cloudflare Phase 4 contract freeze passed');
console.log('  CF-P4-001: PASS; P4-G1 authorizes workspace bootstrap only');
