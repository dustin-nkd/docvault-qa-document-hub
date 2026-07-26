import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Sprint } from './cloudflare-phase-7-sprint-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase7Sprint({
    plan: JSON.parse(read('config/cloudflare/phase-7-sprint-plan.json')),
    sprintSource: read('docs/collaboration-foundation/phase-7-sprint.md'),
    phase6Exit: JSON.parse(read('config/cloudflare/phase-6-exit-gate.json'))
});

console.log('Cloudflare Phase 7 sprint plan gate passed');
console.log('  Fourteen stories, twelve owned surfaces, an unbroken gate chain, remote work behind P7-G4');
console.log('  Six gate UX criteria documented; five sync states and four base states closed');
console.log('  Personal startup free of collaboration modules; deferred scope recorded with reasons');
