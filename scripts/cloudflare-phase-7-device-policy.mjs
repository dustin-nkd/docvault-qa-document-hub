const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const SURFACES = Object.freeze(['device-key-initialization']);
export const ACTIONS = Object.freeze([
    'register-device', 'show-fingerprint', 'await-provisioning', 'revoke-device'
]);
export const STATUSES = Object.freeze([
    'unsupported', 'unregistered', 'enrolling', 'registering', 'rebinding',
    'registered', 'revoking', 'revoked', 'failed'
]);
/** Frozen by CF-P5-005 and rendered here. Phase 7 may not extend it. */
export const READINESS = Object.freeze([
    'key_ready', 'pending_key', 'stale_key', 'not_entitled', 'revoked'
]);
export const WAITING = Object.freeze(['pending_key', 'stale_key']);
export const PERSONAL_KEYS = Object.freeze(['docvault_docs', 'docvault_deleted_ids',
    'docvault_sync_pending', 'DocStorage']);

/** Strip comments before asserting a construct is absent. */
export function code(source) {
    return String(source)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function validatePhase7Device({ manifest, contract, journeySource, lifecycleSource,
    styleSource, indexHtml, serviceWorker, serverReadinessSource, browserTestSource,
    unitTestSource, journeyExports }) {
    const journeyCode = code(journeySource);
    const lifecycleCode = code(lifecycleSource);
    const exported = journeyExports || {};

    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-005' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P7-G2B' && manifest.next_gate === 'P7-G2C'
        && manifest.authorizes_on_approval === 'CF-P7-006',
    'Unsupported Phase 7 device manifest');

    assert(same(manifest.surfaces || [], SURFACES), 'The owned surface set drifted');
    const surface = (contract.surfaces || []).find(item => item.id === 'device-key-initialization');
    assert(surface?.owner === 'CF-P7-005',
        'Surface device-key-initialization is not owned by CF-P7-005 in the frozen contract');
    assert(same(surface.actions || [], ACTIONS),
        'The journey no longer performs the actions the frozen contract gives this surface');

    // ── the ordering the two contracts force ─────────────────────────────────
    const registration = manifest.registration || {};
    assert(same(registration.actions || [], ACTIONS), 'The action set drifted');
    assert(same(registration.statuses || [], STATUSES), 'The status set drifted');
    for (const key of ['enrolment_precedes_registration', 'server_assigns_device_id',
        'client_device_id_is_local_until_rebind', 'fingerprint_compared_before_rebind',
        'rebind_writes_before_deleting']) {
        assert(registration[key] === true, `The registration claim drifted: ${key}`);
    }
    assert(registration.rebind_generates_no_new_key_material === true,
        'The rebind may now generate new key material, orphaning the registered fingerprint');
    assert(typeof registration.rationale === 'string' && registration.rationale.length > 200,
        'The ordering rationale was dropped');
    assert(registration.suite === 'P256-HKDF-SHA256-A256GCM-v1', 'The frozen suite drifted');
    assert(exported.DEVICE_SUITE === registration.suite,
        'The module sends a suite the manifest does not declare');

    const enrolAt = journeyCode.indexOf('lifecycle.enroll(');
    const registerAt = journeyCode.indexOf('api.registerDevice({');
    const compareAt = journeyCode.indexOf('FINGERPRINT_MISMATCH');
    const rebindAt = journeyCode.indexOf('lifecycle.rebindDeviceId(');
    assert(enrolAt > -1 && registerAt > -1 && compareAt > -1 && rebindAt > -1,
        'The registration journey lost one of its four ordered steps');
    assert(enrolAt < registerAt,
        'Registration is attempted before a key exists to register');
    assert(registerAt < compareAt,
        'The fingerprint is compared before the server has returned one');
    assert(compareAt < rebindAt,
        'The local key is re-bound before the returned fingerprint is compared');

    // ── the service extension, kept in the service ───────────────────────────
    const extension = manifest.service_extension || {};
    assert(extension.method === 'rebindDeviceId', 'The service extension claim drifted');
    assert(extension.new_cryptographic_primitive === false
        && extension.reuses_existing_protect_and_decrypt === true,
    'The rebind claims a new cryptographic primitive, which Phase 7 may not add');
    assert(typeof extension.reason === 'string' && extension.reason.length > 80,
        'The reason for extending a closed service was dropped');
    assert(same(extension.browser_matrix_qualified || [], ['chromium', 'firefox', 'webkit']),
        'The rebind is no longer qualified across the required browser matrix');
    assert(/rebindDeviceId/.test(lifecycleSource),
        'The rebind left the key lifecycle module');
    assert(!/rebindDeviceId\s*\(nextDeviceId[\s\S]{0,900}?generateKey/.test(lifecycleCode),
        'The rebind generates a key pair instead of moving the existing one');
    // Anchored inside the rebind body. `enroll` also writes to the store, so an
    // unanchored search can pair its put with the rebind's delete and pass a
    // file where the rebind really does delete first.
    const rebindBody = lifecycleCode.slice(lifecycleCode.indexOf('async rebindDeviceId('));
    const rebindEnd = rebindBody.indexOf('async revokeLocalDevice(');
    const rebindOnly = rebindEnd > -1 ? rebindBody.slice(0, rebindEnd) : rebindBody;
    const putAt = rebindOnly.indexOf('this.store.put(');
    const deleteAt = rebindOnly.indexOf('this.store.delete(');
    assert(putAt > -1 && deleteAt > -1,
        'The rebind no longer moves the stored record');
    assert(putAt < deleteAt,
        'The rebind deletes the original record before the replacement is written');
    // The journey must not perform crypto itself.
    for (const primitive of ['subtle.', 'generateKey', 'deriveBits', 'PBKDF2']) {
        assert(!journeyCode.includes(primitive),
            `The device journey performs cryptography itself: ${primitive}`);
    }
    assert(/rebindDeviceId/.test(browserTestSource) && /fingerprintUnchanged/.test(browserTestSource),
        'The browser matrix no longer proves the rebind keeps the fingerprint');
    assert(/originalRecordRemoved/.test(browserTestSource),
        'The browser matrix no longer proves the abandoned record is removed');

    // ── the inherited readiness vocabulary ───────────────────────────────────
    const readiness = manifest.readiness || {};
    // Pinned to the server's declared union, not to a substring search of the
    // file: 'rotating' appears in that source as a rotation literal and would
    // wrongly satisfy a looser check, letting a value the readiness API cannot
    // return be rendered as if it could.
    const union = serverReadinessSource.match(/export type WorkspaceKeyReadiness\s*=\s*([^;]+);/);
    assert(union !== null, 'The server no longer declares WorkspaceKeyReadiness');
    const serverValues = [...union[1].matchAll(/'([a-z_]+)'/g)].map(match => match[1]);
    assert(same(readiness.values || [], serverValues),
        `The rendered readiness set drifted from WorkspaceKeyReadiness (${serverValues.join(', ')})`);
    assert(same(readiness.values || [], READINESS), 'The readiness vocabulary drifted');
    assert(readiness.extended === false, 'Phase 7 claims to have extended an inherited vocabulary');
    assert(readiness.every_value_explains_itself === true
        && readiness.waiting_is_not_an_error === true
        && readiness.distinct_reason_per_waiting_value === true
        && readiness.not_entitled_recovers_through_switcher_not_retry === true,
    'The readiness claim drifted');
    assert(same(readiness.waiting_values || [], WAITING), 'The waiting set drifted');
    assert(same(exported.KEY_READINESS || [], READINESS),
        'The module renders a readiness set other than the frozen one');
    // Every value the server can return must be one the surface can render.
    for (const value of serverValues) {
        assert(journeySource.includes(value), `The surface cannot render ${value}`);
    }
    const explanations = new Set(WAITING.map(value => exported.presentReadiness?.(value)?.reason));
    assert(explanations.size === WAITING.length,
        'Two waiting states share one explanation, so the user cannot tell them apart');
    for (const value of READINESS) {
        assert(styleSource.includes(`collab-device__shape--${value}`),
            `Readiness ${value} has no shape, leaving colour as the only signal`);
    }

    // ── the fingerprint exists to be read aloud ──────────────────────────────
    const fingerprint = manifest.fingerprint || {};
    assert(fingerprint.grouped_for_reading_aloud === true && fingerprint.value_unaltered === true
        && fingerprint.rendered_ungrouped === false, 'The fingerprint claim drifted');
    assert(/formatFingerprint/.test(journeySource), 'The fingerprint is no longer grouped');
    assert(/show-fingerprint/.test(journeySource), 'The fingerprint action was dropped');

    // ── revocation order ─────────────────────────────────────────────────────
    const revocation = manifest.revocation || {};
    assert(revocation.server_before_local === true
        && revocation.local_key_survives_a_refused_revocation === true,
    'The revocation claim drifted');
    const serverRevokeAt = journeyCode.indexOf('api.revokeDevice(');
    const localRevokeAt = journeyCode.indexOf('lifecycle.revokeLocalDevice(');
    assert(serverRevokeAt > -1 && localRevokeAt > -1 && serverRevokeAt < localRevokeAt,
        'The local key is deleted before the server has revoked the device');

    // ── preconditions ────────────────────────────────────────────────────────
    const preconditions = manifest.preconditions || {};
    assert(preconditions.blocked_control_hidden === false
        && preconditions.blocked_control_states_reason === true
        && preconditions.unknown_session_does_not_render_signed_out === true
        && preconditions.unsupported_browser_states_what_and_how === true,
    'A control the user cannot use may now be hidden instead of explained');
    assert(/aria-disabled/.test(journeySource) && /'title'/.test(journeySource),
        'A disabled control no longer states its reason');
    assert(/unsupportedBrowserGuidance/.test(journeySource),
        'The unsupported-browser guidance is restated instead of delegated');

    // ── isolation ────────────────────────────────────────────────────────────
    const isolation = manifest.isolation || {};
    for (const key of ['inner_html_used', 'eager_script_tag', 'service_worker_precached',
        'generates_own_uuid', 'network_call_in_module']) {
        assert(isolation[key] === false, `The isolation claim drifted: ${key}`);
    }
    assert(isolation.personal_storage_keys_referenced === 0, 'The isolation claim drifted');
    for (const key of PERSONAL_KEYS) {
        assert(!journeyCode.includes(key), `The device journey reached for ${key}`);
    }
    assert(!/\.innerHTML/.test(journeyCode), 'The device journey renders through innerHTML');
    assert(!/\bfetch\s*\(/.test(journeyCode),
        'The device journey performs its own transport instead of going through a service');
    assert(!/randomUUID/.test(journeyCode),
        'The device journey mints identifiers instead of taking them from its caller');
    assert(!/<script[^>]+collaboration\//.test(indexHtml),
        'A collaboration module became an eager script tag');
    assert(!/collaboration/.test(serviceWorker),
        'A collaboration module entered the service worker precache');

    const tests = manifest.tests || {};
    const actual = (unitTestSource.match(/^test\(/gm) || []).length;
    assert(tests.unit_count === actual,
        `Unit test inventory drifted: manifest says ${tests.unit_count}, suite has ${actual}`);
    assert(typeof tests.policy === 'string' && typeof tests.browser === 'string',
        'The story ships without a policy or browser suite');
    return true;
}
