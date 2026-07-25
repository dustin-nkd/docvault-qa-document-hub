const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export const DEFERRED_OPERATIONS = Object.freeze(['listDocuments', 'readDocument', 'createDocument',
    'updateDocument', 'tombstoneDocument', 'listRevisions', 'readRevision', 'reconcileMutation']);

export const NAMESPACE_COMPONENTS = Object.freeze(['environment', 'subject', 'workspaceId',
    'deviceId', 'documentId']);

const sorted = values => [...values].sort();
const sameSet = (actual, expected) => JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));

export function validatePhase6Provider({ manifest, providerSource, characterizationSource,
    isolationSource, indexHtml, serviceWorker, evidenceSources, personalStorageDiffLines }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P6'
        && manifest.story === 'CF-P6-002' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P6-G1' && manifest.next_gate === 'P6-G2'
        && manifest.authorizes_on_approval === 'CF-P6-003', 'Unsupported Phase 6 provider manifest');

    // Gate G1: Personal documents unchanged. A non-zero personal diff means the
    // characterization baseline is no longer proving anything.
    assert(manifest.personal_vault?.storage_diff_lines === 0 && personalStorageDiffLines === 0,
        'Personal Vault storage changed during the provider refactor');
    assert(manifest.personal_vault.characterization_captured_before_refactor === true
        && manifest.personal_vault.characterization_tests >= 10
        && manifest.personal_vault.characterization_result === 'PASS',
    'Personal Vault characterization baseline drifted');
    assert(manifest.personal_vault.call_site_migration_completed === false
        && manifest.personal_vault.call_site_migration_story === 'CF-P6-007',
    'Call-site migration status must stay honest');

    const isolation = manifest.isolation || {};
    assert(isolation.explicit_selection === true && isolation.default_provider === null
        && isolation.fallback_to_personal === false
        && isolation.collaboration_references_personal === false
        && isolation.guest_uses_provider === false, 'Provider isolation drifted');
    assert(sameSet(isolation.namespace_components || [], NAMESPACE_COMPONENTS),
        'Namespace components drifted');
    assert(sameSet(manifest.deferred_operations || [], DEFERRED_OPERATIONS)
        && manifest.deferred_operations_fail_closed === true
        && manifest.deferred_operations_story === 'CF-P6-004..006',
    'Deferred operation contract drifted');

    // The module must stay lazy or a Personal-only user pays for collaboration code.
    assert(manifest.lazy_loading?.eager_script_tag === false
        && manifest.lazy_loading.service_worker_precached === false, 'Lazy-loading claim drifted');
    assert(!/collaboration\/storage-provider\.js/.test(indexHtml),
        'The provider module became an eager script');
    assert(!/collaboration/.test(serviceWorker), 'The provider module entered the service worker precache');

    // Source-level guarantees that make isolation structural rather than documented.
    assert(/export function createCollaborationProvider/.test(providerSource)
        && /export function createPersonalVaultProvider/.test(providerSource)
        && /export function createProviderRegistry/.test(providerSource)
        && /export function collaborationNamespace/.test(providerSource),
    'Provider module surface drifted');
    for (const operation of DEFERRED_OPERATIONS) {
        assert(new RegExp(`${operation}: notImplemented\\(`).test(providerSource),
            `${operation} no longer fails closed`);
    }
    const collaborationBody = providerSource.slice(
        providerSource.indexOf('export function createCollaborationProvider'),
        providerSource.indexOf('export function createProviderRegistry'));
    assert(!/DocStorage|GitHubSync|docStorage/.test(collaborationBody),
        'The collaboration provider gained a personal-storage reference');
    assert(/PROVIDER_CONTEXT_CLEARED/.test(providerSource)
        && /clearForContextChange/.test(providerSource), 'Context-change clearing was removed');

    assert(/CF-P6-002 characterization baseline/.test(characterizationSource)
        && /docvault_docs/.test(characterizationSource), 'Characterization baseline drifted');
    assert(/writes nothing to Personal Vault/.test(isolationSource)
        && /zero eager Phase 6 collaboration modules/.test(isolationSource),
    'Isolation test coverage drifted');

    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P6-002'), `${id} is not PASS evidence for CF-P6-002`);
    }
    assert(sameSet(Object.keys(evidenceSources),
        ['CF-EV-P6-UT-001', 'CF-EV-P6-QA-001', 'CF-EV-P6-SEC-002']), 'Provider evidence inventory drifted');

    const boundary = manifest.authorization_boundary || {};
    assert(boundary.routes_implemented === 0 && boundary.migrations_created === 0
        && boundary.remote_writes === 0 && boundary.collaboration_activation === 'NO-GO',
    'Phase 6 provider authorization boundary drifted');
    return true;
}
