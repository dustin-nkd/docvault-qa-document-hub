const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const SURFACES = Object.freeze(['member-list-role-badge']);
export const ACTIONS = Object.freeze(['change-role', 'grant-admin', 'transfer-ownership',
    'remove-member', 'revoke-device', 'provision-key']);
export const ROLES = Object.freeze(['owner', 'admin', 'editor', 'viewer']);
export const MEMBER_STATES = Object.freeze(['pending_key', 'active', 'removed']);
export const PERSONAL_KEYS = Object.freeze(['docvault_docs', 'docvault_deleted_ids',
    'docvault_sync_pending', 'DocStorage']);

/** Strip comments before asserting a construct is absent. */
export function code(source) {
    return String(source)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function validatePhase7Members({ manifest, contract, journeySource, styleSource,
    indexHtml, serviceWorker, rbacDocument, unitTestSource, journeyExports }) {
    const journeyCode = code(journeySource);
    const exported = journeyExports || {};

    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-006' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P7-G2C' && manifest.next_gate === 'P7-G2D'
        && manifest.authorizes_on_approval === 'CF-P7-007',
    'Unsupported Phase 7 member manifest');

    assert(same(manifest.surfaces || [], SURFACES), 'The owned surface set drifted');
    const surface = (contract.surfaces || []).find(item => item.id === 'member-list-role-badge');
    assert(surface?.owner === 'CF-P7-006',
        'Surface member-list-role-badge is not owned by CF-P7-006 in the frozen contract');
    assert(same(surface.actions || [], ['list-members', 'show-role-badge', 'show-key-readiness']),
        'The surface no longer performs the actions the frozen contract gives it');
    for (const action of surface.actions) {
        assert(journeySource.includes(action), `The surface cannot perform ${action}`);
    }

    // ── U3, which this story decides ─────────────────────────────────────────
    const ux = manifest.gate_ux || {};
    assert(ux.criterion === 'U3', 'The gate UX reference was dropped');
    assert(ux.control_hidden_when_denied === false,
        'A control the user may not use may now be hidden instead of explained');
    assert(ux.control_programmatically_disabled === true,
        'A denied control may now be styled rather than disabled');
    assert(ux.reason_is_announced_text === true && ux.reason_is_not_tooltip_only === true,
        'A denial reason may now be invisible to assistive technology');
    assert(ux.fails_only_on_submit === false && ux.every_denial_states_a_reason === true,
        'The U3 claim drifted');
    assert(ux.reason_ids_scoped_per_instance === true,
        'Two member lists on one page could share a reason id and announce the wrong one');
    // `$` and `{` escaped: unescaped, `$` reads as an end-of-string anchor and
    // the assertion can never match, which would make this check decorative.
    assert(/\$\{instanceId\}-reason-/.test(journeySource),
        'The denial reason id is no longer scoped to the rendered instance');
    assert(typeof ux.rationale === 'string' && ux.rationale.length > 150,
        'The reason for explaining rather than hiding was dropped');

    // Structural: disabled, aria-disabled, and a described text node together.
    assert(/button\.disabled = true;/.test(journeyCode),
        'A denied control is no longer programmatically disabled');
    assert(/aria-disabled/.test(journeySource), 'A denied control lost aria-disabled');
    assert(/aria-describedby/.test(journeySource),
        'A denial reason is no longer associated with its control');
    assert(/collab-members__reason/.test(journeySource) && /reason\.textContent = decision\.reason/.test(journeyCode),
        'The denial reason is no longer rendered as text');
    assert(/collab-members__reason/.test(styleSource),
        'The denial reason has no style hook');
    assert(!/if \(!decision\.allowed\) (return|continue);/.test(journeyCode),
        'A denied control is skipped instead of rendered');

    // ── the matrix is read off the frozen document ───────────────────────────
    const matrix = manifest.matrix || {};
    assert(same(matrix.actions || [], ACTIONS), 'The member action set drifted');
    assert(same(matrix.roles || [], ROLES), 'The role set drifted');
    assert(same(matrix.member_states || [], MEMBER_STATES), 'The member state set drifted');
    assert(matrix.enforced_here === false && matrix.server_remains_the_authority === true,
        'The client claims to enforce authorization');
    assert(typeof matrix.source === 'string' && matrix.source.includes('domain-and-rbac'),
        'The matrix no longer cites the frozen source');
    for (const key of ['owner_removal_denied_to_everyone', 'admin_removal_reserved_to_owner',
        'admin_device_revocation_limited_to_editor_and_viewer',
        'provisioning_requires_actor_key_ready']) {
        assert(matrix[key] === true, `The matrix claim drifted: ${key}`);
    }
    // The four claims above are the ones a careless refactor loses. Each is
    // checked against the frozen document *and* against the live decision.
    assert(/Remove Owner \/ last Owner \| D \| D \| D \| D \| D \| D \|/.test(rbacDocument),
        'The frozen matrix no longer denies owner removal to everyone');
    assert(/Remove Admin \| A \| D \| D \| D \| D \| D \|/.test(rbacDocument),
        'The frozen matrix no longer reserves admin removal to the owner');
    const decide = exported.memberActionDecision;
    assert(typeof decide === 'function', 'The decision function was not provided');
    for (const actorRole of ROLES) {
        assert(decide({ action: 'remove-member', actorRole, targetRole: 'owner',
            targetState: 'active' }).allowed === false,
        `${actorRole} may now remove an owner`);
    }
    assert(decide({ action: 'remove-member', actorRole: 'admin', targetRole: 'admin',
        targetState: 'active' }).allowed === false, 'An admin may now remove another admin');
    assert(decide({ action: 'revoke-device', actorRole: 'admin', targetRole: 'admin',
        targetState: 'active' }).allowed === false,
    'An admin may now revoke another admin\'s device');
    assert(decide({ action: 'provision-key', actorRole: 'owner', targetRole: 'editor',
        targetState: 'active', targetReadiness: 'pending_key', actorKeyReady: false })
        .allowed === false, 'A device without the key may now provision it to someone else');
    // Every denial the matrix can produce must explain itself.
    for (const action of ACTIONS) {
        for (const actorRole of ROLES) {
            for (const targetRole of ROLES) {
                const decision = decide({ action, actorRole, targetRole, targetState: 'active',
                    targetReadiness: 'pending_key', actorKeyReady: true });
                if (decision.allowed) continue;
                assert(typeof decision.reason === 'string' && decision.reason.length >= 10,
                    `${action} denies ${actorRole} on ${targetRole} without a reason`);
            }
        }
    }

    // ── the readiness vocabulary is reused, not restated ─────────────────────
    const readiness = manifest.readiness || {};
    assert(readiness.second_vocabulary_defined === false,
        'A second readiness vocabulary was defined');
    assert(/from '\.\/device-initialization\.js'/.test(journeySource),
        'The readiness vocabulary is no longer reused from CF-P7-005');
    assert(!/KEY_READINESS = Object\.freeze/.test(journeyCode),
        'This module redefines the inherited readiness vocabulary');

    // ── isolation ────────────────────────────────────────────────────────────
    const isolation = manifest.isolation || {};
    for (const key of ['inner_html_used', 'eager_script_tag', 'service_worker_precached',
        'network_call_in_module', 'cursor_constructed_client_side']) {
        assert(isolation[key] === false, `The isolation claim drifted: ${key}`);
    }
    assert(isolation.personal_storage_keys_referenced === 0, 'The isolation claim drifted');
    for (const key of PERSONAL_KEYS) {
        assert(!journeyCode.includes(key), `The member list reached for ${key}`);
    }
    assert(!/\.innerHTML/.test(journeyCode), 'The member list renders through innerHTML');
    assert(!/\bfetch\s*\(/.test(journeyCode), 'The member list performs its own transport');
    assert(!/<script[^>]+collaboration\//.test(indexHtml),
        'A collaboration module became an eager script tag');
    assert(!/collaboration/.test(serviceWorker),
        'A collaboration module entered the service worker precache');

    const tests = manifest.tests || {};
    const actual = (unitTestSource.match(/^test\(/gm) || []).length;
    assert(tests.unit_count === actual,
        `Unit test inventory drifted: manifest says ${tests.unit_count}, suite has ${actual}`);
    assert(typeof tests.policy === 'string', 'The story ships without a policy suite');
    return true;
}
