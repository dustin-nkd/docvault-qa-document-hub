const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const SURFACES = Object.freeze(['invitation-manage']);
export const ACTIONS = Object.freeze([
    'create-invitation', 'copy-acceptance-link', 'revoke-invitation'
]);
export const INVITABLE = Object.freeze(['admin', 'editor', 'viewer']);
/** Ways a secret escapes a browser tab. None may appear in this module. */
export const LEAK_SINKS = Object.freeze(['localStorage', 'sessionStorage', 'indexedDB',
    'caches.', 'console.', 'document.cookie', 'history.pushState', 'navigator.sendBeacon']);
export const PERSONAL_KEYS = Object.freeze(['docvault_docs', 'docvault_deleted_ids',
    'docvault_sync_pending', 'DocStorage']);

/** Strip comments before asserting a construct is absent. */
export function code(source) {
    return String(source)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function validatePhase7Invitations({ manifest, contract, journeySource, styleSource,
    indexHtml, serviceWorker, apiContract, unitTestSource, journeyExports }) {
    const journeyCode = code(journeySource);
    const exported = journeyExports || {};

    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-007' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P7-G2D' && manifest.next_gate === 'P7-G3'
        && manifest.authorizes_on_approval === 'CF-P7-008',
    'Unsupported Phase 7 invitation manifest');

    assert(same(manifest.surfaces || [], SURFACES), 'The owned surface set drifted');
    const surface = (contract.surfaces || []).find(item => item.id === 'invitation-manage');
    assert(surface?.owner === 'CF-P7-007',
        'Surface invitation-manage is not owned by CF-P7-007 in the frozen contract');
    assert(same(surface.actions || [], ACTIONS),
        'The surface no longer performs the actions the frozen contract gives it');
    assert(same(surface.roles || [], ['owner', 'admin']),
        'The surface role restriction drifted from the frozen contract');
    for (const action of ACTIONS) {
        assert(journeySource.includes(action), `The surface cannot perform ${action}`);
    }

    // ── the secret ───────────────────────────────────────────────────────────
    const secret = manifest.secret_handling || {};
    assert(secret.token_bits_minimum === 256, 'The token strength claim drifted');
    for (const key of ['returned_once', 'fragment_only', 'query_string_rejected',
        'clearable_by_caller', 'clipboard_injected', 'blocked_clipboard_explains_manual_path']) {
        assert(secret[key] === true, `The secret-handling claim drifted: ${key}`);
    }
    for (const key of ['recoverable', 'rendered_into_anchor', 'stored_anywhere', 'logged']) {
        assert(secret[key] === false, `The secret-handling claim drifted: ${key}`);
    }
    assert(typeof secret.rationale === 'string' && secret.rationale.length > 200,
        'The reason the token lives in a fragment was dropped');
    // The claim is checked against the contract that makes it.
    assert(/appears only in the URL fragment, is returned once/.test(apiContract),
        'The API contract no longer says the token is fragment-only and returned once');

    // Structural: no sink may appear anywhere in the module.
    for (const sink of LEAK_SINKS) {
        assert(!journeyCode.includes(sink), `The invitation surface reaches for ${sink}`);
    }
    assert(!/\.href\s*=/.test(journeyCode),
        'The acceptance URL may be rendered into an anchor, which would enter browser history');
    assert(/TOKEN_NOT_IN_FRAGMENT/.test(journeySource),
        'A URL carrying the token outside its fragment is no longer refused');
    assert(/TOKEN_MAY_NOT_REACH_A_QUERY_STRING/.test(journeySource),
        'A URL carrying a query string is no longer refused');
    assert(/setAttribute\('readonly', 'readonly'\)/.test(journeyCode),
        'The one-time link is no longer rendered into a readonly field');
    assert(/role', 'alert'/.test(journeyCode),
        'The one-time warning is no longer announced assertively');
    assert(typeof exported.holdAcceptanceUrl === 'function',
        'The one-time holder was not provided');
    const held = exported.holdAcceptanceUrl(`https://x.test/#/invite/${'a'.repeat(43)}`);
    assert(held.oneTimeOnly === true && held.recoverable === false,
        'The holder no longer states that the value cannot be recovered');
    held.clear();
    let readAfterClear = false;
    try { held.read(); readAfterClear = true; } catch { readAfterClear = false; }
    assert(readAfterClear === false, 'A cleared acceptance URL can still be read');

    // ── who may invite whom ──────────────────────────────────────────────────
    const authority = manifest.authority || {};
    assert(same(authority.invitable_roles || [], INVITABLE), 'The invitable role set drifted');
    for (const key of ['owner_cannot_be_invited', 'admin_invitation_reserved_to_owner',
        'revocation_follows_creation_split', 'server_remains_the_authority']) {
        assert(authority[key] === true, `The authority claim drifted: ${key}`);
    }
    assert(authority.enforced_here === false, 'The client claims to enforce authorization');
    const decide = exported.invitationDecision;
    assert(typeof decide === 'function', 'The decision function was not provided');
    assert(decide({ actorRole: 'admin', role: 'admin' }).allowed === false,
        'An admin may now invite an admin');
    assert(decide({ actorRole: 'admin', role: 'admin', action: 'revoke' }).allowed === false,
        'An admin may now revoke an admin invitation');
    for (const actorRole of ['editor', 'viewer']) {
        assert(decide({ actorRole, role: 'viewer' }).allowed === false,
            `${actorRole} may now invite`);
    }
    for (const action of ['create', 'revoke']) {
        for (const actorRole of ['owner', 'admin', 'editor', 'viewer']) {
            for (const role of INVITABLE) {
                const decision = decide({ actorRole, role, action });
                if (decision.allowed) continue;
                assert(typeof decision.reason === 'string' && decision.reason.length >= 10,
                    `${action}/${actorRole}/${role} denies without a reason`);
            }
        }
    }

    // ── presentation ─────────────────────────────────────────────────────────
    const presentation = manifest.presentation || {};
    assert(presentation.denied_control_hidden === false
        && presentation.denied_control_states_reason === true
        && presentation.reason_ids_scoped_per_instance === true
        && presentation.one_time_warning_is_assertive === true,
    'The presentation claim drifted');
    assert(/aria-disabled/.test(journeySource) && /aria-describedby/.test(journeySource),
        'A denied control no longer states its reason');
    assert(/\$\{instanceId\}-/.test(journeySource),
        'Reason ids are no longer scoped to the rendered instance');
    assert(/collab-invites__warning/.test(styleSource),
        'The one-time warning has no style hook');

    // ── isolation ────────────────────────────────────────────────────────────
    const isolation = manifest.isolation || {};
    for (const key of ['inner_html_used', 'eager_script_tag', 'service_worker_precached',
        'network_call_in_module']) {
        assert(isolation[key] === false, `The isolation claim drifted: ${key}`);
    }
    assert(isolation.personal_storage_keys_referenced === 0, 'The isolation claim drifted');
    for (const key of PERSONAL_KEYS) {
        assert(!journeyCode.includes(key), `The invitation surface reached for ${key}`);
    }
    assert(!/\.innerHTML/.test(journeyCode), 'The invitation surface renders through innerHTML');
    assert(!/\bfetch\s*\(/.test(journeyCode), 'The invitation surface performs its own transport');
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
