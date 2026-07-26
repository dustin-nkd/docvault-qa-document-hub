const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const SURFACES = Object.freeze(['invitation-accept']);
export const ACTIONS = Object.freeze(['review-invitation', 'accept-invitation']);
export const REVIEW_STATES = Object.freeze(['pending', 'expired', 'revoked', 'consumed']);
export const LEAK_SINKS = Object.freeze(['localStorage', 'sessionStorage', 'indexedDB',
    'caches.', 'console.', 'document.cookie', 'navigator.sendBeacon']);
export const PERSONAL_KEYS = Object.freeze(['docvault_docs', 'docvault_deleted_ids',
    'docvault_sync_pending', 'DocStorage']);

/** Strip comments before asserting a construct is absent. */
export function code(source) {
    return String(source)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function validatePhase7Accept({ manifest, contract, journeySource, styleSource,
    indexHtml, serviceWorker, apiContract, unitTestSource, journeyExports }) {
    const journeyCode = code(journeySource);
    const exported = journeyExports || {};

    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-008' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P7-G3' && manifest.next_gate === 'P7-G3A'
        && manifest.authorizes_on_approval === 'CF-P7-009',
    'Unsupported Phase 7 acceptance manifest');

    assert(same(manifest.surfaces || [], SURFACES), 'The owned surface set drifted');
    const surface = (contract.surfaces || []).find(item => item.id === 'invitation-accept');
    assert(surface?.owner === 'CF-P7-008',
        'Surface invitation-accept is not owned by CF-P7-008 in the frozen contract');
    assert(same(surface.actions || [], ACTIONS),
        'The surface no longer performs the actions the frozen contract gives it');
    for (const action of ACTIONS) {
        assert(journeySource.includes(action), `The surface cannot perform ${action}`);
    }

    // ── the token in the address bar ─────────────────────────────────────────
    const token = manifest.token_from_address_bar || {};
    for (const key of ['read_from_fragment_only', 'address_bar_cleared',
        'cleared_before_token_is_returned', 'history_replacement_used', 'token_sent_in_body']) {
        assert(token[key] === true, `The address-bar claim drifted: ${key}`);
    }
    for (const key of ['history_push_used', 'token_in_path_or_query', 'stored_anywhere', 'logged']) {
        assert(token[key] === false, `The address-bar claim drifted: ${key}`);
    }
    assert(typeof token.rationale === 'string' && token.rationale.length > 200,
        'The reason replacement is used instead of a push was dropped');
    assert(/appears only in the URL fragment/.test(apiContract),
        'The API contract no longer places the token in the fragment');
    assert(/removes it from the address bar using history replacement/.test(apiContract),
        'The API contract no longer requires history replacement');

    // Structural: replaceState is present, pushState is absent anywhere, and the
    // clear happens before the value is returned.
    // Push is checked first: swapping replace for push trips both assertions,
    // and the useful diagnosis is the push, not the missing replace.
    assert(!/pushState/.test(journeyCode),
        'A pushed history entry would restore the token into the address bar on Back');
    assert(/history\.replaceState\(/.test(journeyCode),
        'The address bar is no longer cleared after the token is read');
    const clearAt = journeyCode.indexOf('history.replaceState(');
    const returnAt = journeyCode.indexOf('token: matched[1]');
    assert(clearAt > -1 && returnAt > -1 && clearAt < returnAt,
        'The token is handed to a caller before the address bar is cleared');
    for (const sink of LEAK_SINKS) {
        assert(!journeyCode.includes(sink), `The acceptance surface reaches for ${sink}`);
    }
    assert(/bootstrapInvitation\(\{ token \}\)/.test(journeyCode),
        'The token is no longer sent in the request body');
    assert(typeof exported.takeTokenFromFragment === 'function',
        'The fragment reader was not provided');
    const calls = [];
    const taken = exported.takeTokenFromFragment({
        location: { hash: `#/invite/${'a'.repeat(43)}`, pathname: '/app', search: '' },
        history: { replaceState: (...args) => calls.push(args) }
    });
    assert(taken.token !== null && calls.length === 1,
        'Reading a token no longer clears the address bar');
    assert(!String(calls[0][2]).includes(taken.token),
        'The replacement URL still carries the token');
    const untouched = [];
    exported.takeTokenFromFragment({
        location: { hash: '#/settings', pathname: '/app', search: '' },
        history: { replaceState: (...args) => untouched.push(args) }
    });
    assert(untouched.length === 0, 'The address bar is rewritten when there is no token to hide');

    // ── the review ───────────────────────────────────────────────────────────
    const review = manifest.review || {};
    assert(same(review.states || [], REVIEW_STATES), 'The review state set drifted');
    assert(review.only_pending_is_actionable === true
        && review.every_non_actionable_state_explains_itself === true
        && review.grants_no_authority === true
        && review.identity_mismatch_named_before_submit === true,
    'The review claim drifted');
    for (const state of REVIEW_STATES) {
        assert(journeySource.includes(`'${state}'`) || journeySource.includes(`${state}:`),
            `The surface cannot render ${state}`);
    }
    assert(/identityMatch === false/.test(journeyCode),
        'A mismatched identity is no longer named before submit');

    // ── acceptance ───────────────────────────────────────────────────────────
    const acceptance = manifest.acceptance || {};
    assert(acceptance.requires_active_own_device === true
        && acceptance.creates_pending_key_membership === true
        && acceptance.outcome_stated_before_choice === true,
    'The acceptance claim drifted');
    assert(acceptance.conveys_usable_key === false,
        'Acceptance claims to convey a usable key, which it does not');
    assert(/MEMBERSHIP_NOT_PENDING_KEY/.test(journeySource),
        'A membership other than pending_key is no longer refused');
    assert(/pendingKeyAfterAccept/.test(journeySource),
        'The surface no longer states what acceptance actually gets you');
    assert(/from '\.\/device-initialization\.js'/.test(journeySource),
        'The readiness vocabulary is no longer reused from CF-P7-005');

    // ── presentation and isolation ───────────────────────────────────────────
    const presentation = manifest.presentation || {};
    assert(presentation.denied_control_hidden === false
        && presentation.denied_control_states_reason === true
        && presentation.reason_ids_scoped_per_instance === true,
    'The presentation claim drifted');
    assert(/aria-disabled/.test(journeySource) && /aria-describedby/.test(journeySource),
        'A denied control no longer states its reason');
    assert(/\$\{instanceId\}-/.test(journeySource),
        'Reason ids are no longer scoped to the rendered instance');
    assert(/collab-accept__reason/.test(styleSource), 'The denial reason has no style hook');

    const isolation = manifest.isolation || {};
    for (const key of ['inner_html_used', 'eager_script_tag', 'service_worker_precached',
        'network_call_in_module']) {
        assert(isolation[key] === false, `The isolation claim drifted: ${key}`);
    }
    assert(isolation.personal_storage_keys_referenced === 0, 'The isolation claim drifted');
    for (const key of PERSONAL_KEYS) {
        assert(!journeyCode.includes(key), `The acceptance surface reached for ${key}`);
    }
    assert(!/\.innerHTML/.test(journeyCode), 'The acceptance surface renders through innerHTML');
    assert(!/\bfetch\s*\(/.test(journeyCode), 'The acceptance surface performs its own transport');
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
