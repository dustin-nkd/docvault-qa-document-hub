import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Provider } from '../scripts/cloudflare-phase-6-provider-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-6');
const IDS = ['CF-EV-P6-UT-001', 'CF-EV-P6-QA-001', 'CF-EV-P6-SEC-002'];

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-6-provider-isolation.json'),
        providerSource: read('js/collaboration/storage-provider.js'),
        characterizationSource: read('tests/personal-vault-characterization.test.mjs'),
        isolationSource: read('tests/storage-provider-isolation.test.mjs'),
        indexHtml: read('index.html'),
        serviceWorker: read('sw.js'),
        evidenceSources: Object.fromEntries(IDS
            .map(id => [id, fs.readFileSync(path.join(evidenceDirectory, `${id}.md`), 'utf8')])),
        personalStorageDiffLines: 0
    };
}

test('CF-P6-002 delivers provider isolation with Personal Vault unchanged', () => {
    assert.equal(validatePhase6Provider(actualInput()), true);
});

test('CF-P6-002 rejects personal drift, fallback, eager loading, and scope creep', () => {
    for (const mutate of [
        input => { input.manifest.status = 'PENDING'; },
        input => { input.manifest.next_gate = 'P6-G3'; },
        input => { input.manifest.authorizes_on_approval = 'CF-P6-006'; },
        // Gate G1 must fail if Personal Vault actually changed.
        input => { input.personalStorageDiffLines = 1; },
        input => { input.manifest.personal_vault.storage_diff_lines = 4; },
        input => { input.manifest.personal_vault.characterization_captured_before_refactor = false; },
        input => { input.manifest.personal_vault.characterization_tests = 2; },
        input => { input.manifest.personal_vault.characterization_result = 'SKIPPED'; },
        // Overclaiming call-site migration.
        input => { input.manifest.personal_vault.call_site_migration_completed = true; },
        input => { input.manifest.personal_vault.call_site_migration_story = 'CF-P6-002'; },
        // Isolation.
        input => { input.manifest.isolation.explicit_selection = false; },
        input => { input.manifest.isolation.default_provider = 'personal-vault'; },
        input => { input.manifest.isolation.fallback_to_personal = true; },
        input => { input.manifest.isolation.collaboration_references_personal = true; },
        input => { input.manifest.isolation.guest_uses_provider = true; },
        input => { input.manifest.isolation.namespace_components = ['environment']; },
        // Deferred operations must stay closed and distinct.
        input => { input.manifest.deferred_operations = ['readDocument']; },
        input => { input.manifest.deferred_operations_fail_closed = false; },
        input => { input.manifest.deferred_operations_story = 'CF-P6-002'; },
        input => { input.providerSource = input.providerSource.replace('createDocument: notImplemented(', 'createDocument: (() => null) || notImplemented('); },
        // Lazy loading.
        input => { input.manifest.lazy_loading.eager_script_tag = true; },
        input => { input.manifest.lazy_loading.service_worker_precached = true; },
        input => { input.indexHtml += '<script src="js/collaboration/storage-provider.js"></script>'; },
        input => { input.serviceWorker += "'./js/collaboration/storage-provider.js',"; },
        // Structural isolation in source.
        input => { input.providerSource = input.providerSource.replace('export function createCollaborationProvider', 'function createCollaborationProvider'); },
        input => {
            input.providerSource = input.providerSource.replace(
                'const context = { environment, subject, workspaceId, deviceId };',
                'const context = { environment, subject, workspaceId, deviceId, fallback: DocStorage };');
        },
        input => { input.providerSource = input.providerSource.replaceAll('PROVIDER_CONTEXT_CLEARED', 'OK'); },
        input => { input.providerSource = input.providerSource.replaceAll('clearForContextChange', 'noop'); },
        // Test sources must keep proving the claims.
        input => { input.characterizationSource = 'nothing'; },
        input => { input.isolationSource = input.isolationSource.replace('writes nothing to Personal Vault', 'does stuff'); },
        input => { input.isolationSource = input.isolationSource.replace('zero eager Phase 6 collaboration modules', 'loads modules'); },
        // Evidence.
        input => { delete input.evidenceSources['CF-EV-P6-SEC-002']; },
        input => { input.evidenceSources['CF-EV-P6-QA-001'] = '# CF-EV-P6-QA-001 x\n\nStatus: PENDING\n\nCF-P6-002\n'; },
        input => { input.evidenceSources['CF-EV-P6-UT-001'] = input.evidenceSources['CF-EV-P6-UT-001'].replaceAll('CF-P6-002', 'CF-P6-003'); },
        // Boundary.
        input => { input.manifest.authorization_boundary.routes_implemented = 1; },
        input => { input.manifest.authorization_boundary.migrations_created = 1; },
        input => { input.manifest.authorization_boundary.remote_writes = 1; },
        input => { input.manifest.authorization_boundary.collaboration_activation = 'GO'; }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase6Provider(input), Error);
    }
});
