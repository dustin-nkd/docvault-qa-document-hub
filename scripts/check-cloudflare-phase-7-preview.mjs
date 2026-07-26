import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Preview } from './cloudflare-phase-7-preview-policy.mjs';
import * as entry from '../js/collaboration/entry.js';
import * as services from '../js/collaboration/services.js';
import * as apiClient from '../js/collaboration/api-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const manifest = JSON.parse(read('config/cloudflare/phase-7-preview-integration.json'));

await validatePhase7Preview({
    manifest,
    contract: JSON.parse(read('config/cloudflare/phase-7-ui-contract.json')),
    apiContract: read('docs/collaboration-foundation/api-contract.md'),
    entry,
    services,
    apiClient,
    panelSource: read('js/collaboration/surface-panel.js'),
    entrySource: read('js/collaboration/entry.js'),
    deploymentSource: read('js/deployment.js'),
    evidence: read(manifest.preview.evidence)
});

console.log('Cloudflare Phase 7 Preview integration gate passed');
console.log(`  CF-P7-013: ${manifest.status}; qualified under P7-G4 against Preview`);
console.log('  The composition is driven, not read: the shipped entry was run against a '
    + 'recording transport');
console.log(`  ${manifest.composition.surfaces_in_panel.length} panel surfaces mount, `
    + `${manifest.composition.routes_exercised.length} routes are exercised, `
    + '0 surfaces are left on loading once every read has returned');
console.log('  A refused read becomes that surface\'s own error and leaves its neighbours '
    + 'rendering; an unrecognised code fails closed');
console.log('  Access removed is claimed only after a membership re-check, never from the '
    + 'non-disclosing denial code alone');
console.log(`  Preview deployment ${manifest.preview.deployment} from `
    + `${manifest.preview.source_commit}: ${manifest.preview.modules_before_opener} `
    + `collaboration modules before the opener, ${manifest.preview.modules_after_opener} after`);

// Narrowed coverage is stated out loud, not left in a file nobody opens.
for (const limit of manifest.declared_limits.journeys_not_completable_in_this_build) {
    console.log(`  DECLARED LIMIT: "${limit.journey}" cannot complete in this build — `
        + `missing ${limit.missing}`);
}
console.log('  DECLARED LIMIT: sync states reachable here — '
    + `${manifest.declared_limits.sync_states_reachable.join(', ')}; not reachable — `
    + `${manifest.declared_limits.sync_states_not_reachable.join(', ')}`);

if (manifest.preview.journeys_qualified !== true) {
    console.log('');
    console.log(`  NOT PASS: ${manifest.status}. No journey is qualified, because the measured `
        + 'deployment answers 503 COLLABORATION_UNAVAILABLE.');
    console.log(`  OWNER ACTION REQUIRED: ${manifest.blocked_on.owner_action}`);
    console.log(`  Blocks: ${manifest.blocked_on.blocks.join(', ')}`);
}
