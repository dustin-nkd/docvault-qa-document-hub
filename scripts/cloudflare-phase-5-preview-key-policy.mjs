const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sameSet = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());

export const EVIDENCE = ['CF-EV-P5-E2E-003', 'CF-EV-P5-PERF-002', 'CF-EV-P5-SEC-007',
    'CF-EV-P5-OPS-002', 'CF-EV-P5-QA-003'];

export function validatePhase5PreviewKeyFoundation({ manifest, sprint, wrangler, migrationManifest,
    handlerSource, querySource, apiSource, cursorSource, workersTest, reportSource, evidenceSources }) {
    assert(manifest?.phase === 'CF-P5' && manifest.story === 'CF-P5-007'
        && manifest.status === 'READY_FOR_P5_G4', 'CF-P5-007 preflight status drifted');
    assert(manifest.gate_authorization?.entry_gate === 'P5-G3'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.local_integration_authorized === true
        && manifest.gate_authorization.remote_authorization_gate === 'P5-G4'
        && manifest.gate_authorization.remote_changes_authorized === false
        && manifest.gate_authorization.exit_gate === 'P5-G4A', 'P5-G3 authorization ceiling drifted');
    assert(sprint.authorization?.gate === 'P5-G3'
        && sprint.authorization.authorized_story === 'CF-P5-007'
        && sprint.authorization.remote_changes_authorized === false
        && sprint.authorization.next_gate === 'P5-G4'
        && sprint.stories?.slice(0, 6).every(story => story.status === 'PASS')
        && sprint.stories?.[6]?.status === 'IN_PROGRESS'
        && sprint.stories?.[7]?.status === 'PLANNED', 'Sprint disposition drifted');

    assert(migrationManifest.entries?.length === 12
        && migrationManifest.entries[10]?.story === 'CF-P5-004'
        && migrationManifest.entries[11]?.story === 'CF-P5-006', 'Local migration inventory drifted');
    const environments = [wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars];
    assert(environments.every(vars => vars?.KEY_FOUNDATION_MODE === 'disabled'),
        'Checked-in key route mode must fail closed everywhere');
    assert(!wrangler.d1_databases && !wrangler.env?.production?.d1_databases
        && wrangler.env?.production?.vars?.IDENTITY_RUNTIME_MODE === 'disabled', 'Production isolation drifted');

    assert((handlerSource.match(/id: '[^']+'/g) || []).length === 13
        && handlerSource.includes("env.KEY_FOUNDATION_MODE !== 'preview-only'")
        && handlerSource.includes("url.origin !== PREVIEW_ORIGIN")
        && handlerSource.includes('verifyCsrfToken')
        && handlerSource.includes('enforceIdentityRateLimit')
        && handlerSource.includes('parseWorkspaceKeyEnvelope')
        && handlerSource.includes('Idempotency-Key'), 'Preview key route controls drifted');
    for (const prohibited of [/console\./, /Math\.random\s*\(/, /private_jwk/i,
        /plaintext.{0,16}(?:dek|key)/i, /deployed.{0,12}bypass/i]) {
        assert(!prohibited.test(handlerSource), `Prohibited key handler pattern: ${prohibited}`);
    }
    assert(querySource.includes('listWorkspaceProvisioningDevices')
        && querySource.includes('readCurrentWorkspaceEnvelope')
        && querySource.includes('readRotationCommitBinding')
        && querySource.includes("caller.role IN ('owner','admin')"), 'Scoped key read queries drifted');
    assert(cursorSource.includes("'devices'") && cursorSource.includes("'workspace-devices'"),
        'Opaque cursor routes drifted');
    assert(apiSource.lastIndexOf('handleIdentityRuntime') < apiSource.lastIndexOf('handlePreviewKeyFoundationApi')
        && apiSource.lastIndexOf('handlePreviewKeyFoundationApi') < apiSource.lastIndexOf('handlePreviewCollaborationApi')
        && apiSource.lastIndexOf('handlePreviewCollaborationApi') < apiSource.lastIndexOf('handleApiRequest'),
    'API dispatch order drifted');

    assert((workersTest.match(/\bit\s*\(/g) || []).length === 3
        && workersTest.includes('keyed bootstrap') && workersTest.includes('unwrapWorkspaceKey')
        && workersTest.includes('monotonic rotation') && workersTest.includes('300 ms local p95'),
    'Workers Preview key qualification inventory drifted');
    assert(manifest.qualification?.workers_test_count === 3
        && manifest.qualification.preview_read_p95_budget_ms === 300
        && manifest.qualification.p0_p1_skips === 0
        && manifest.qualification.accepted_flakes === 0, 'Qualification budget drifted');

    for (const key of ['remote_writes', 'remote_migrations_applied', 'remote_variables_changed',
        'preview_deploys_triggered', 'production_changes', 'secrets_created_or_changed']) {
        assert(manifest.scope?.[key] === 0, `P5-G3 exceeded remote scope: ${key}`);
    }
    assert(sameSet(manifest.remote_evidence || [], EVIDENCE)
        && sameSet(Object.keys(evidenceSources), EVIDENCE), 'Remote evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `)
            && /^Status: PENDING P5-G4 REMOTE QUALIFICATION$/m.test(source)
            && !/^Status: PASS$/m.test(source), `${id} was prematurely marked complete`);
    }
    assert(/^Status: READY FOR P5-G4$/m.test(reportSource)
        && reportSource.includes('No remote D1 migration')
        && reportSource.includes('Production remains out of scope'), 'Preflight report incomplete');
    assert(manifest.next_decision?.gate === 'P5-G4'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.production_changes_authorized === false, 'P5-G4 handoff drifted');
    return true;
}
