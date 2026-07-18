import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase4Exit } from '../scripts/cloudflare-phase-4-exit-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-4');
    return {
        manifest: json('config/cloudflare/phase-4-exit-gate.json'),
        evidenceSources: Object.fromEntries(fs.readdirSync(evidenceDirectory).filter(name => /^CF-EV-P4-.*\.md$/.test(name))
            .map(name => [name.replace(/\.md$/, ''), fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')])),
        storyContracts: {
            'CF-P4-001': json('config/cloudflare/phase-4-contract-freeze.json'),
            'CF-P4-002': json('config/cloudflare/phase-4-workspace-bootstrap.json'),
            'CF-P4-003': json('config/cloudflare/phase-4-central-rbac.json'),
            'CF-P4-004': json('config/cloudflare/phase-4-invitation-lifecycle.json'),
            'CF-P4-005': json('config/cloudflare/phase-4-membership-administration.json'),
            'CF-P4-006': json('config/cloudflare/phase-4-audit-scoped-reads.json'),
            'CF-P4-007': json('config/cloudflare/phase-4-preview-api-integration.json')
        },
        migrationManifest: json('migrations/manifest.json'), wrangler: json('wrangler.jsonc'),
        packageJson: json('package.json'), riskRegister: read('docs/collaboration-foundation/risk-register.md'),
        exitReport: read('docs/collaboration-foundation/phase-4-exit-report.md'),
        handoff: read('docs/collaboration-foundation/phase-5-handoff.md'),
        asOf: new Date('2026-07-18T00:00:00Z')
    };
}

test('CF-P4-008 reconciles Phase 4 quality, recovery, boundaries, and Phase 5 handoff', () => {
    assert.equal(validatePhase4Exit(actualInput()), true);
});

test('CF-P4-008 rejects activation, tenant/security exceptions, evidence loss, and schema drift', () => {
    for (const mutate of [
        input => { input.manifest.decision.collaboration_activation = 'GO'; },
        input => { input.manifest.quality.cross_tenant_bypasses.push('bypass'); },
        input => { delete input.evidenceSources['CF-EV-P4-SEC-008']; },
        input => { input.manifest.schema_inventory.pending_remote_migrations = 1; },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; }
    ]) {
        const input = actualInput(); mutate(input);
        assert.throws(() => validatePhase4Exit(input));
    }
});

test('CF-P4-008 rejects destructive recovery, incompatible rollback, expired review, and incomplete handoff', () => {
    for (const mutate of [
        input => { input.manifest.recovery.shared_preview_restore_executed = true; },
        input => { input.manifest.recovery.previous_runtime_schema = 9; },
        input => { input.asOf = new Date('2026-10-19T00:00:00Z'); },
        input => { input.handoff = input.handoff.replace('CF-P5-001', 'missing-story'); }
    ]) {
        const input = actualInput(); mutate(input);
        assert.throws(() => validatePhase4Exit(input));
    }
});
