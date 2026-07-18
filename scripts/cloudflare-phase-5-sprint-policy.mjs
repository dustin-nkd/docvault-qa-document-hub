const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export const STORY_IDS = Array.from({ length: 8 }, (_, index) => `CF-P5-${String(index + 1).padStart(3, '0')}`);
export const GATE_SEQUENCE = ['P5-G0', 'P5-G1', 'P5-G2', 'P5-G2A', 'P5-G2B', 'P5-G2C', 'P5-G2C-M', 'P5-G3', 'P5-G4', 'P5-G4A', 'P5-G5'];

const sameSet = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
const tableIds = (source, prefix) => new Set(source.split(/\r?\n/)
    .map(line => line.match(new RegExp(`^\\| (${prefix === 'CF' ? 'CF-[A-Z]+-\\d{3}' : `${prefix}\\d{2}`}) \\|`))?.[1])
    .filter(Boolean));

export function validatePhase5SprintPlan({ manifest, sprintSource, handoff, implementationPlan,
    traceability, threatModel, riskRegister, phase4Exit, migrationManifest, wrangler }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P5'
        && manifest.sprint === 'CF-P5-S01' && manifest.title === 'E2EE key foundation',
    'Unsupported Phase 5 sprint plan');
    assert(manifest.status === 'ACTIVE'
        && manifest.authorization?.gate === 'P5-G1'
        && manifest.authorization.decision === 'APPROVED'
        && manifest.authorization.approved_on === '2026-07-18'
        && manifest.authorization.authorized_story === 'CF-P5-002'
        && manifest.authorization.next_gate === 'P5-G2',
    'P5-G1 authorization boundary drifted');
    assert(manifest.planned_window?.working_days === 20
        && manifest.planned_window.timezone === 'Asia/Ho_Chi_Minh', 'Phase 5 sprint window drifted');
    assert(phase4Exit?.phase === 'CF-P4' && phase4Exit.story === 'CF-P4-008'
        && phase4Exit.status === 'PASS'
        && phase4Exit.decision?.phase_5_device_keys_and_e2ee === 'GO'
        && phase4Exit.decision.collaboration_activation === 'NO-GO', 'Phase 4 entry authority drifted');
    assert(manifest.entry?.phase_4_exit === 'PASS'
        && manifest.entry.phase_5_device_keys_and_e2ee === 'GO'
        && manifest.entry.collaboration_activation === 'NO-GO'
        && manifest.entry.production_identity === 'NO-GO'
        && manifest.entry.production_business_routes === 'NO-GO'
        && manifest.entry.preview_schema_version === 10
        && manifest.entry.preview_business_entity_rows === 0
        && manifest.entry.production_d1_bindings === 0, 'Phase 5 entry boundary drifted');

    const scope = manifest.scope_reconciliation || {};
    assert(scope.decision === 'phase-5-is-device-and-workspace-key-foundation-only'
        && scope.phase_5_in_scope?.length === 7
        && sameSet(scope.deferred_to_phase_6 || [], ['document-ciphertext-envelopes',
            'encrypted-document-crud-and-revisions', 'conflicts-and-tombstones',
            'encrypted-offline-outbox-and-sync'])
        && scope.deferred_to_phase_7?.length === 3, 'Phase 5/6/7 scope reconciliation drifted');
    assert(handoff.includes('Encrypted documents, revisions, conflicts, and sync remain Phase 6 scope')
        && implementationPlan.includes('## 8. Phase 5')
        && implementationPlan.includes('## 9. Phase 6'), 'Controlling roadmap and handoff are not reconciled');

    const boundary = manifest.boundaries || {};
    for (const key of ['production_identity_enabled', 'production_business_routes_enabled',
        'production_key_routes_enabled', 'github_pages_collaboration_enabled', 'collaboration_enabled',
        'preview_key_routes_enabled_before_P5_G4', 'document_routes_enabled', 'sync_routes_enabled',
        'server_plaintext_key_path_allowed', 'server_escrow_or_unlock_reset_allowed',
        'recovery_artifact_allowed', 'deployed_test_bypass_allowed', 'real_customer_data_allowed',
        'shared_preview_restore_allowed']) {
        assert(boundary[key] === false, `Phase 5 prohibited boundary enabled: ${key}`);
    }
    assert(boundary.production_d1_bindings === 0, 'Production D1 must remain absent');
    assert(manifest.route_scope?.status === 'not-authorized-until-CF-P5-001-freeze-and-later-gates'
        && manifest.route_scope.authorized_routes?.length === 0
        && manifest.route_scope.planned_operation_families?.length === 5,
    'Phase 5 route authorization drifted');

    const security = manifest.security_contract || {};
    assert(security.canonical_json === 'RFC8785-JCS'
        && security.binary_encoding === 'RFC4648-base64url-unpadded-canonical'
        && security.device_suite === 'P256-ECDH-v1'
        && security.private_key_kdf === 'PBKDF2-HMAC-SHA256-v1'
        && security.private_key_kdf_iterations === 600000
        && security.private_key_envelope === 'A256GCM-v1'
        && security.workspace_key_suite === 'P256-HKDF-SHA256-A256GCM-v1'
        && security.workspace_dek_bytes === 32 && security.aes_gcm_nonce_bytes === 12
        && security.aes_gcm_tag_bytes === 16 && security.hkdf_salt_bytes === 32
        && security.device_private_key_persistence === 'encrypted-pkcs8-envelope-only-in-indexeddb'
        && security.unlocked_private_key === 'non-extractable-deriveBits-only'
        && security.workspace_plaintext_key_server_visibility === 'prohibited'
        && security.server_escrow === 'prohibited'
        && security.algorithm_negotiation_or_plaintext_fallback === 'prohibited',
    'Phase 5 security contract drifted');
    assert(sameSet(manifest.schema_decisions_required_at_P5_G1 || [], [
        'close-first-provisioner-gap-between-workspace-key-version-placeholder-and-creator-envelope',
        'prove-wrapper-holds-unrevoked-current-version-envelope-in-dedicated-provision-recipe',
        'freeze-rotation-id-and-eligible-device-snapshot-persistence',
        'select-schema-10-sufficiency-or-separately-gated-forward-only-migration'
    ]), 'P5-G1 schema/security decisions drifted');

    const stories = manifest.stories || [];
    assert(sameSet(stories.map(story => story.id), STORY_IDS), 'Phase 5 story inventory drifted');
    const requirements = tableIds(traceability, 'CF');
    const threats = tableIds(threatModel, 'T');
    const risks = tableIds(riskRegister, 'R');
    const evidence = [];
    for (const [index, story] of stories.entries()) {
        assert(story.status === (index < 2 ? 'PASS' : 'PLANNED') && story.owners?.length > 0 && story.reviewers?.length > 0,
            `${story.id} status or ownership drifted`);
        assert(new Set([...story.owners, ...story.reviewers]).has('Senior QA'),
            `${story.id} lacks Senior QA accountability`);
        assert(story.requirements?.length && story.threats?.length && story.risks?.length && story.evidence?.length,
            `${story.id} lacks traceability`);
        for (const id of story.requirements) assert(requirements.has(id), `${story.id} references unknown requirement ${id}`);
        for (const id of story.threats) assert(threats.has(id), `${story.id} references unknown threat ${id}`);
        for (const id of story.risks) assert(risks.has(id), `${story.id} references unknown risk ${id}`);
        evidence.push(...story.evidence);
    }
    assert(new Set(evidence).size === evidence.length, 'Phase 5 evidence IDs must belong to one story');
    assert(stories[0].entry_gate === 'P5-G0' && stories[0].exit_gate === 'P5-G1'
        && stories[5].conditional_migration_gate === 'P5-G2C-M'
        && stories[6].remote_authorization_gate === 'P5-G4'
        && stories[7].exit_gate === 'P5-G5', 'Phase 5 gate sequence drifted');

    const quality = manifest.quality_budgets || {};
    for (const key of ['p0_p1_skips', 'p0_p1_quarantines', 'accepted_flakiness', 'open_p0_p1_defects',
        'prohibited_material_canary_matches', 'crypto_downgrade_or_plaintext_fallback_successes',
        'cross_binding_unwrap_successes', 'unauthorized_provisioning_successes',
        'revoked_device_future_envelope_successes', 'nonce_salt_or_ephemeral_key_reuse_in_100_trials',
        'personal_guest_eager_phase5_crypto_bytes', 'dependency_critical_high_vulnerabilities']) {
        assert(quality[key] === 0, `Phase 5 quality exception is not zero: ${key}`);
    }
    assert(quality.positive_and_negative_vector_agreement_percent === 100
        && quality.pbkdf2_600k_p95_ms === 1500 && quality.pbkdf2_600k_max_ms === 2500
        && quality.device_protect_or_unlock_p95_ms === 2000
        && quality.workspace_wrap_or_unwrap_p95_ms === 250
        && quality.provision_25_devices_p95_ms === 3000
        && quality.preview_read_p95_ms === 300 && quality.preview_write_p95_ms === 500
        && quality.lazy_phase5_crypto_chunk_gzip_kib === 50
        && quality.total_collaboration_startup_gzip_kib === 75, 'Phase 5 performance budget drifted');

    const recovery = manifest.recovery_contract || {};
    assert(recovery.alternate_key_ready_owner_or_admin_provisioning === 'required'
        && recovery.all_provisioners_lost === 'terminal-cryptographic-loss'
        && recovery.operator_or_server_key_recovery === 'prohibited'
        && recovery.shared_preview_time_travel === 'read-only-bookmark-fingerprint-only'
        && recovery.shared_preview_restore === 'prohibited-without-separate-destructive-approval'
        && recovery.disposable_d1_restore_rehearsal === 'required-before-P5-exit'
        && recovery.rollback_rule === 'preserve-monotonic-key-version-and-envelope-history',
    'Phase 5 recovery contract drifted');

    assert(migrationManifest.entries?.length === 10, 'Sprint planning added an unauthorized migration');
    assert(!wrangler.d1_databases && !wrangler.env?.production?.d1_databases
        && [wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
            .every(vars => vars?.COLLABORATION_ENABLED === 'false'),
    'Production D1 or collaboration activation drifted');
    assert(/^Status: \*\*READY FOR APPROVAL AT `P5-G0`\*\*$/m.test(sprintSource),
        'Sprint document approval status drifted');
    for (const id of STORY_IDS) assert(sprintSource.includes(`### \`${id}\``), `Sprint document lacks ${id}`);
    for (const gate of GATE_SEQUENCE) assert(sprintSource.includes(gate), `Sprint document lacks ${gate}`);
    for (const phrase of ['first provisioner', 'wrapper device itself owns a live',
        'rotation ID and immutable eligible-device snapshot', 'Production and collaboration activation remain `NO-GO`']) {
        assert(sprintSource.toLowerCase().includes(phrase.toLowerCase()), `Sprint document lacks blocker: ${phrase}`);
    }
    return true;
}
