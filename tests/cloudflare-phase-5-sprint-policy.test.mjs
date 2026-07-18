import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase5SprintPlan } from '../scripts/cloudflare-phase-5-sprint-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-5-sprint-plan.json'),
        sprintSource: read('docs/collaboration-foundation/phase-5-sprint.md'),
        handoff: read('docs/collaboration-foundation/phase-5-handoff.md'),
        implementationPlan: read('docs/collaboration-foundation/implementation-plan.md'),
        traceability: read('docs/collaboration-foundation/traceability-matrix.md'),
        threatModel: read('docs/collaboration-foundation/threat-model.md'),
        riskRegister: read('docs/collaboration-foundation/risk-register.md'),
        phase4Exit: json('config/cloudflare/phase-4-exit-gate.json'),
        migrationManifest: json('migrations/manifest.json'), wrangler: json('wrangler.jsonc')
    };
}

test('Phase 5 plan freezes key-only scope, gates, traceability, crypto, recovery, and quality boundaries', () => {
    assert.equal(validatePhase5SprintPlan(actualInput()), true);
});

test('Phase 5 plan rejects premature authorization, Phase 6 scope pull-forward, production, and route activation', () => {
    for (const mutate of [
        input => { input.manifest.authorization.decision = 'APPROVED'; },
        input => { input.manifest.scope_reconciliation.deferred_to_phase_6.pop(); },
        input => { input.manifest.boundaries.document_routes_enabled = true; },
        input => { input.manifest.route_scope.authorized_routes.push('POST /api/v1/devices'); },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { input.wrangler.env.preview.vars.COLLABORATION_ENABLED = 'true'; }
    ]) {
        const input = actualInput(); mutate(input);
        assert.throws(() => validatePhase5SprintPlan(input));
    }
});

test('Phase 5 plan rejects weaker crypto/performance, missing blockers, unknown traceability, and duplicate evidence', () => {
    for (const mutate of [
        input => { input.manifest.security_contract.private_key_kdf_iterations = 300000; },
        input => { input.manifest.quality_budgets.pbkdf2_600k_p95_ms = 3000; },
        input => { input.manifest.schema_decisions_required_at_P5_G1.pop(); },
        input => { input.manifest.stories[0].requirements = ['CF-KEY-999']; },
        input => { input.manifest.stories[1].evidence[0] = input.manifest.stories[0].evidence[0]; },
        input => { input.migrationManifest.entries.push({ sequence: 11 }); }
    ]) {
        const input = actualInput(); mutate(input);
        assert.throws(() => validatePhase5SprintPlan(input));
    }
});
