import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase3SprintPlan } from '../scripts/cloudflare-phase-3-sprint-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-3-sprint-plan.json'),
        sprintSource: read('docs/collaboration-foundation/phase-3-sprint.md'),
        traceability: read('docs/collaboration-foundation/traceability-matrix.md'),
        threatModel: read('docs/collaboration-foundation/threat-model.md'),
        riskRegister: read('docs/collaboration-foundation/risk-register.md'),
        wrangler: json('wrangler.jsonc')
    };
}

test('Phase 3 plan freezes scope, gates, traceability, security, and environment boundaries', () => {
    assert.equal(validatePhase3SprintPlan(actualInput()), true);
});

test('Phase 3 plan rejects premature authorization, production identity, route expansion, and collaboration activation', () => {
    for (const mutate of [
        input => { input.manifest.authorization.decision = 'PENDING'; },
        input => { input.manifest.boundaries.production_identity_enabled = true; },
        input => { input.manifest.route_scope.push('POST /api/v1/workspaces'); },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { input.wrangler.env.preview.vars.COLLABORATION_ENABLED = 'true'; }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase3SprintPlan(input));
    }
});

test('Phase 3 plan rejects unknown traceability, duplicate evidence, and weaker quality budgets', () => {
    const requirement = actualInput(); requirement.manifest.stories[0].requirements = ['CF-ID-999']; assert.throws(() => validatePhase3SprintPlan(requirement), /unknown requirement/);
    const evidence = actualInput(); evidence.manifest.stories[1].evidence[0] = evidence.manifest.stories[0].evidence[0]; assert.throws(() => validatePhase3SprintPlan(evidence), /one story/);
    const budget = actualInput(); budget.manifest.quality_budgets.oauth_replay_successes = 1; assert.throws(() => validatePhase3SprintPlan(budget), /not zero/);
});
