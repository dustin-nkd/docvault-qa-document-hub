import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    TICKET_SPECS, validatePhase7WiringSprint
} from './cloudflare-phase-7-wiring-sprint-policy.mjs';
import { validatePhase7ActionReachability }
    from './cloudflare-phase-7-action-reachability-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const plan = JSON.parse(read('config/cloudflare/phase-7-wiring-sprint-plan.json'));
const collaborationDirectory = path.join(root, 'js', 'collaboration');
const collaborationSources = Object.fromEntries(fs.readdirSync(collaborationDirectory)
    .filter(file => file.endsWith('.js'))
    .map(file => [file, fs.readFileSync(path.join(collaborationDirectory, file), 'utf8')]));
const evidenceSources = Object.fromEntries((plan.tickets || [])
    .filter(ticket => ticket.status === 'PASS')
    .map(ticket => [ticket.evidence.id, read(ticket.evidence.path)]));

validatePhase7WiringSprint({
    plan,
    sprintSource: read('docs/collaboration-foundation/phase-7-wiring-sprint.md'),
    evidenceSources
});
validatePhase7ActionReachability({ plan, sources: collaborationSources });

console.log('Cloudflare Phase 7 wiring remediation sprint gate passed');
console.log(`  ${TICKET_SPECS.length} ordered tickets; concurrency limited to one`);
console.log(`  Current ticket: ${plan.current_ticket}; commit and push wait for AGY review PASS`);
console.log('  Every ticket requires composed entry and browser action-to-request evidence');
console.log('  Enabled actions require a handler or an exact owned-debt record');
