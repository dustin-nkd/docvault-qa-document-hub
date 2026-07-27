import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Sprint, STORY_IDS } from './cloudflare-phase-7-sprint-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const plan = JSON.parse(read('config/cloudflare/phase-7-sprint-plan.json'));
validatePhase7Sprint({
    plan,
    sprintSource: read('docs/collaboration-foundation/phase-7-sprint.md'),
    phase6Exit: JSON.parse(read('config/cloudflare/phase-6-exit-gate.json'))
});

// Counted, never spelled out by hand: the last time this line carried a literal
// it said "fourteen" while the plan held fifteen, and nothing caught it.
const passing = plan.stories.filter(story => story.status === 'PASS').length;
console.log('Cloudflare Phase 7 sprint plan gate passed');
console.log(`  ${passing} of ${STORY_IDS.length} stories PASS; twelve owned surfaces, an unbroken gate chain, remote work behind P7-G4`);
console.log('  Six gate UX criteria documented; five sync states and four base states closed');
console.log('  Personal startup free of collaboration modules; deferred scope recorded with reasons');
