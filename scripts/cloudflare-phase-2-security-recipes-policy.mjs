const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const REMOTE_KEYS = ['d1_databases', 'kv_namespaces', 'r2_buckets', 'durable_objects', 'services', 'queues'];
const containsKey = (value, keys) => value && typeof value === 'object' && (
    Object.keys(value).some(key => keys.includes(key))
    || Object.values(value).some(child => containsKey(child, keys))
);

export function validatePhase2SecurityRecipes({ foundation, recipeSource, idempotencySource, authorizationSource,
    migrationSource, apiSources, evidenceSources, wrangler }) {
    assert(foundation?.schema_version === 1 && foundation.phase === 'CF-P2'
        && foundation.story === 'CF-P2-005' && foundation.status === 'PASS', 'Unsupported CF-P2-005 contract');
    assert(foundation.gate_authorization?.id === 'P2-G2A'
        && foundation.gate_authorization.decision === 'APPROVED'
        && foundation.gate_authorization.approved_at === '2026-07-16', 'P2-G2A authorization drifted');
    assert(foundation.schema_correction?.migration === '0008_a3d0bd3e8ae7_transition_guards.sql'
        && foundation.schema_correction.previous_migrations_immutable === true
        && foundation.schema_correction.backfill === 'none', 'Transition guard correction drifted');
    assert(same(foundation.recipes, ['workspace.create', 'invitation.replace', 'invitation.accept',
        'membership.change', 'envelope.provision', 'document.update', 'rotation.commit']), 'Recipe inventory drifted');
    assert((foundation.race_matrix || []).length === 7, 'Race matrix is incomplete');
    assert(Object.values(foundation.environment_boundary || {}).every(value => value === false), 'CF-P2-005 expanded runtime authority');
    assert(!containsKey(wrangler, REMOTE_KEYS), 'Remote binding exists during CF-P2-005');
    assert(wrangler.vars?.COLLABORATION_ENABLED === 'false'
        && wrangler.env?.preview?.vars?.COLLABORATION_ENABLED === 'false'
        && wrangler.env?.production?.vars?.COLLABORATION_ENABLED === 'false', 'Collaboration must remain disabled');

    for (const operation of foundation.recipes) assert(recipeSource.includes(`'${operation}'`), `Recipe is missing: ${operation}`);
    for (const builder of ['buildWorkspaceCreateRecipe', 'buildInvitationReplaceRecipe',
        'buildInvitationAcceptRecipe', 'buildMembershipChangeRecipe', 'buildEnvelopeProvisionRecipe',
        'buildDocumentMutationRecipe', 'buildRotationCommitRecipe']) {
        assert(recipeSource.includes(builder), `Typed recipe builder is missing: ${builder}`);
    }
    const source = `${recipeSource}\n${idempotencySource}\n${authorizationSource}`;
    assert(!/SELECT\s+\*/i.test(source), 'SELECT * is prohibited');
    assert(!/\$\{/.test(source), 'Runtime SQL interpolation is prohibited');
    assert(!/\bas\s+(?:any|unknown)\b|:\s*any\b/i.test(source), 'Unsafe casts are prohibited');
    assert(!/first-unconstrained/.test(source), 'Unconstrained authorization reads are prohibited');
    for (const token of ['resolveAuthorizedReplay', 'IDEMPOTENCY_KEY_REUSED',
        'IDEMPOTENCY_EXPIRED', 'AUTHORITY_REVOKED', 'first-primary']) assert(source.includes(token), `Idempotency control is missing: ${token}`);

    for (const token of ['CREATE TABLE transition_guards', 'transition_guards_authority_insert',
        'transition_guards_no_update', 'transition_guards_no_delete', 'schema_version = 8']) {
        assert(migrationSource.includes(token), `Schema correction control is missing: ${token}`);
    }
    assert(!/\b(?:invitation_token|session_token|private_key|plaintext_dek|document_body)\b/i.test(migrationSource), 'Protected value appears in migration');

    const api = Object.values(apiSources).join('\n');
    assert(!/mutation-recipes|idempotency|transition_guards|COLLAB_DB/i.test(api), 'Disabled API reaches CF-P2-005 persistence');
    assert(api.includes('COLLABORATION_UNAVAILABLE'), 'Disabled API contract drifted');
    assert(same(Object.keys(evidenceSources), foundation.evidence), 'CF-P2-005 evidence inventory drifted');
    for (const [id, sourceText] of Object.entries(evidenceSources)) {
        assert(sourceText.startsWith(`# ${id} `) && /^Status: PASS$/m.test(sourceText), `${id} is not PASS`);
        assert(sourceText.includes('CF-P2-005') && sourceText.includes('P2-G2A'), `${id} lacks story/gate provenance`);
        assert(/local-only|No remote D1/i.test(sourceText), `${id} lacks local-only evidence`);
    }
    return true;
}
