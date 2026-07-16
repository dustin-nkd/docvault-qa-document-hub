import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2SecurityRecipes } from '../scripts/cloudflare-phase-2-security-recipes-policy.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
function actual() {
    const foundation = JSON.parse(read('config/cloudflare/phase-2-security-recipes.json'));
    return { foundation, recipeSource: read('functions/_lib/persistence/mutation-recipes.ts'),
        idempotencySource: read('functions/_lib/persistence/idempotency.ts'),
        authorizationSource: read('functions/_lib/persistence/authorization-session.ts'),
        migrationSource: read(`migrations/collaboration/${foundation.schema_correction.migration}`),
        apiSources: { shell: read('functions/_lib/api-shell.mjs'), route: read('functions/api/v1/[[path]].ts') },
        evidenceSources: Object.fromEntries(foundation.evidence.map(id => [id,
            read(`docs/collaboration-foundation/evidence/phase-2/${id}.md`)])),
        wrangler: JSON.parse(read('wrangler.jsonc')) };
}
test('CF-P2-005 locks seven recipes, races, correction, and disabled runtime', () => {
    assert.equal(validatePhase2SecurityRecipes(actual()), true);
});
test('CF-P2-005 rejects recipe, SQL, consistency, and correction drift', () => {
    for (const mutate of [
        input => { input.foundation.recipes.pop(); },
        input => { input.recipeSource += '\nconst unsafe = `SELECT * FROM users`;'; },
        input => { input.authorizationSource = input.authorizationSource.replace("'first-primary'", "'first-unconstrained'"); },
        input => { input.migrationSource = input.migrationSource.replace('transition_guards_no_delete', 'removed_guard'); }
    ]) { const input = actual(); mutate(input); assert.throws(() => validatePhase2SecurityRecipes(input)); }
});
test('CF-P2-005 rejects API reachability, remote state, activation, and evidence loss', () => {
    for (const mutate of [
        input => { input.apiSources.shell += '\nconst db = env.COLLAB_DB;'; },
        input => { input.wrangler.d1_databases = [{ binding: 'COLLAB_DB', database_id: 'forbidden' }]; },
        input => { input.wrangler.env.production.vars.COLLABORATION_ENABLED = 'true'; },
        input => { delete input.evidenceSources['CF-EV-P2-SEC-005']; }
    ]) { const input = actual(); mutate(input); assert.throws(() => validatePhase2SecurityRecipes(input)); }
});
