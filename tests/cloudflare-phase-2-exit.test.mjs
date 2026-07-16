import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase2ExitGate } from '../scripts/cloudflare-phase-2-exit-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-2');
    return {
        manifest: json('config/cloudflare/phase-2-exit-gate.json'),
        evidenceSources: Object.fromEntries(fs.readdirSync(evidenceDirectory).filter(name => /^CF-EV-P2-.*\.md$/.test(name))
            .map(name => [name.replace(/\.md$/, ''), fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')])),
        packageJson: json('package.json'), wrangler: json('wrangler.jsonc'), migrationManifest: json('migrations/manifest.json'),
        storyContracts: {
            'CF-P2-001': json('config/cloudflare/phase-2-schema-freeze.json'), 'CF-P2-002': json('migrations/manifest.json'),
            'CF-P2-003': json('config/cloudflare/phase-2-local-readiness.json'), 'CF-P2-004': json('config/cloudflare/phase-2-persistence-foundation.json'),
            'CF-P2-005': json('config/cloudflare/phase-2-security-recipes.json'), 'CF-P2-006': json('config/cloudflare/phase-2-quality-matrix.json'),
            'CF-P2-007': json('config/cloudflare/phase-2-preview-d1.json'), 'CF-P2-008': json('config/cloudflare/phase-2-recovery-rehearsal.json')
        },
        riskRegister: read('docs/collaboration-foundation/risk-register.md'),
        exitReport: read('docs/collaboration-foundation/phase-2-exit-report.md'), asOf: new Date('2026-07-16T00:00:00Z')
    };
}

test('Phase 2 exit closes all stories, evidence, schema, recovery, and handoff boundaries', () => {
    assert.equal(validatePhase2ExitGate(actualInput()), true);
});

test('Phase 2 exit rejects evidence, checksum, exception, production binding, and activation drift', () => {
    for (const mutate of [
        input => { delete input.evidenceSources['CF-EV-P2-SEC-008']; },
        input => { input.manifest.schema_inventory.migration_sha256.pop(); },
        input => { input.manifest.quality.accepted_flakiness.push('case'); },
        input => { input.manifest.remote_boundary.production_d1_bindings = 1; },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { input.manifest.recommendation.collaboration_activation = 'GO'; }
    ]) {
        const input = actualInput(); mutate(input); assert.throws(() => validatePhase2ExitGate(input));
    }
});

test('Phase 2 exit rejects expired review, unowned/open risk, failed prior story, and incomplete reviewers', () => {
    const expired = actualInput(); expired.asOf = new Date('2026-10-16T00:00:00Z'); assert.throws(() => validatePhase2ExitGate(expired), /expired/);
    const unowned = actualInput(); unowned.riskRegister = unowned.riskRegister.replace('| Security Reviewer | Senior QA |', '|  | Senior QA |'); assert.throws(() => validatePhase2ExitGate(unowned), /ownership/);
    const open = actualInput(); open.riskRegister = open.riskRegister.replace('| Controlled pending evidence |', '| Open |'); assert.throws(() => validatePhase2ExitGate(open), /open risk/);
    const failed = actualInput(); failed.storyContracts['CF-P2-006'].status = 'FAIL'; assert.throws(() => validatePhase2ExitGate(failed), /prior story/);
    const reviewer = actualInput(); reviewer.manifest.stories[0].reviewers = []; assert.throws(() => validatePhase2ExitGate(reviewer), /review/);
});
