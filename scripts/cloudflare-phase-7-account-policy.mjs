const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const SURFACES = Object.freeze(['account-menu', 'workspace-switcher']);
export const STATUSES = Object.freeze(['active', 'none-selected', 'unavailable', 'empty']);
export const ROLES = Object.freeze(['owner', 'admin', 'editor', 'viewer']);
export const PERSONAL_KEYS = Object.freeze(['docvault_docs', 'docvault_deleted_ids',
    'docvault_sync_pending', 'DocStorage']);

/**
 * Strip comments before asserting that a construct is *absent*.
 *
 * These modules document the things they must never do, so a naive search finds
 * the prohibition rather than a violation and fails a correct file. Presence
 * checks may still run against the raw source; only absence checks need this.
 */
export function code(source) {
    return String(source)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function validatePhase7Account({ manifest, contract, contextSource, accountSource,
    switcherSource, styleSource, indexHtml, serviceWorker, unitTestSource }) {
    // Absence checks run against code with comments removed; presence checks may
    // use the raw source.
    const contextCode = code(contextSource);
    const accountCode = code(accountSource);
    const switcherCode = code(switcherSource);
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-003' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P7-G2' && manifest.next_gate === 'P7-G2A'
        && manifest.authorizes_on_approval === 'CF-P7-004',
    'Unsupported Phase 7 account manifest');

    assert(same(manifest.surfaces || [], SURFACES), 'The owned surface set drifted');
    for (const id of SURFACES) {
        assert((contract.surfaces || []).find(item => item.id === id)?.owner === 'CF-P7-003',
            `Surface ${id} is not owned by CF-P7-003 in the frozen contract`);
    }

    // ── U2, the part that is easy to lose ────────────────────────────────────
    const identity = manifest.workspace_identity || {};
    assert(identity.gate_ux === 'U2', 'The workspace identity claim lost its gate reference');
    assert(identity.indicator_outside_menu === true,
        'The workspace indicator moved inside the menu, so U2 no longer holds without opening it');
    assert(identity.survives_reload === true, 'The workspace selection stopped surviving reload');
    assert(identity.silent_fallback_on_unavailable === false,
        'A silent fallback to another workspace was permitted');
    assert(same(identity.statuses || [], STATUSES), 'The context status set drifted');
    assert(identity.every_status_has_a_label === true, 'A context status may render blank');
    assert(same(identity.selection_key_scoped_by || [], ['environment', 'subject']),
        'The selection key scope drifted');
    assert(typeof identity.rationale === 'string' && identity.rationale.length > 80,
        'The no-silent-fallback rationale was dropped');

    // Structural: the resolver must not be able to fall back at all.
    assert(/'unavailable'/.test(contextSource),
        'The context resolver no longer distinguishes an unavailable workspace');
    assert(!/workspaces\[0\]/.test(contextCode),
        'The context resolver reaches for a first-workspace fallback');
    assert(/active-workspace/.test(contextSource) && !/docvault_/.test(contextCode),
        'The selection key drifted toward a personal vault namespace');
    for (const status of STATUSES) {
        assert(contextSource.includes(`'${status}'`),
            `The resolver cannot produce the ${status} status`);
    }
    // The indicator must be rendered by its own function, not only inside the menu.
    assert(/export function renderContextIndicator/.test(switcherSource),
        'The context indicator is no longer independently renderable');
    assert(/data-context-status/.test(switcherSource),
        'Context status is no longer exposed as data, leaving colour as the only signal');
    assert(/collab-context/.test(styleSource) && /collab-context--active/.test(styleSource),
        'The context indicator has no style hook');
    assert(/collab-context:not\(\.collab-context--active\)/.test(styleSource),
        'A non-active context is no longer visually distinguished');

    // ── account menu ─────────────────────────────────────────────────────────
    const account = manifest.account_menu || {};
    for (const key of ['signed_out_is_actionable', 'unknown_session_renders_loading',
        'login_required_when_authenticated', 'avatar_https_only', 'trigger_has_text_label']) {
        assert(account[key] === true, `The account menu claim drifted: ${key}`);
    }
    assert(/LOGIN_REQUIRED/.test(accountSource),
        'An authenticated session no longer requires a login');
    assert(/startsWith\('https:\/\/'\)/.test(accountSource),
        'The avatar is no longer restricted to https');
    assert(/'sign-in'/.test(accountSource) && /'sign-out'/.test(accountSource),
        'The account menu lost an action');

    // ── keyboard and focus ───────────────────────────────────────────────────
    const keyboard = manifest.keyboard || {};
    assert(keyboard.aria_expanded_tracked === true && keyboard.focus_moves_into_open_menu === true
        && keyboard.focus_restored_to_trigger_on_close === true && keyboard.focus_trap === false,
    'The keyboard and focus claim drifted');
    for (const source of [accountSource, switcherSource]) {
        assert(/aria-expanded/.test(source), 'A disclosure lost aria-expanded');
        assert(/trigger\.focus\(\)/.test(source),
            'A disclosure no longer restores focus to its trigger on close');
    }
    assert(/focus-visible/.test(styleSource), 'The visible focus requirement was dropped');

    // ── roles and disabled controls ──────────────────────────────────────────
    const presentation = manifest.role_presentation || {};
    assert(same(presentation.roles || [], ROLES), 'The role set drifted');
    assert(presentation.badge_per_option === true && presentation.unknown_role_rejected === true,
        'The role presentation claim drifted');
    assert(presentation.disabled_control_hidden === false
        && presentation.disabled_control_states_reason === true,
    'A control the user cannot use may now be hidden instead of explained');
    assert(/INVALID_ROLE/.test(switcherSource), 'An unknown role is no longer rejected');
    assert(/aria-disabled/.test(switcherSource) && /title/.test(switcherSource),
        'A disabled control no longer states its reason');
    for (const role of ROLES) {
        assert(styleSource.includes(`collab-role-badge--${role}`),
            `The ${role} badge has no style hook`);
    }

    // ── isolation and laziness ───────────────────────────────────────────────
    const isolation = manifest.isolation || {};
    assert(isolation.personal_storage_keys_referenced === 0 && isolation.inner_html_used === false
        && isolation.eager_script_tag === false && isolation.service_worker_precached === false,
    'The isolation claim drifted');
    for (const source of [contextCode, accountCode, switcherCode]) {
        for (const key of PERSONAL_KEYS) {
            assert(!source.includes(key), `A CF-P7-003 module reached for ${key}`);
        }
        assert(!/\.innerHTML/.test(source), 'A CF-P7-003 module renders through innerHTML');
    }
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
