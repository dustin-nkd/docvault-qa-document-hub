import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2SecurityRecipes } from './cloudflare-phase-2-security-recipes-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const foundation = JSON.parse(read('config/cloudflare/phase-2-security-recipes.json'));
validatePhase2SecurityRecipes({
    foundation,
    recipeSource: read('functions/_lib/persistence/mutation-recipes.ts'),
    idempotencySource: read('functions/_lib/persistence/idempotency.ts'),
    authorizationSource: read('functions/_lib/persistence/authorization-session.ts'),
    migrationSource: read(`migrations/collaboration/${foundation.schema_correction.migration}`),
    apiSources: { shell: read('functions/_lib/api-shell.mjs'), route: read('functions/api/v1/[[path]].ts') },
    evidenceSources: Object.fromEntries(foundation.evidence.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-2/${id}.md`)])),
    wrangler: JSON.parse(read('wrangler.jsonc'))
});
console.log('Cloudflare Phase 2 security mutation recipe gate passed');
console.log('  Recipes: 7 static prepared-statement contracts');
console.log('  Races: 7 fail-closed winner/loser matrices');
console.log('  Schema: forward-only P2-G2A transition guard correction');
console.log('  Runtime: API disabled; no remote D1 or collaboration activation');
