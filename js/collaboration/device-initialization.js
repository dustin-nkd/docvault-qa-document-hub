// Device and key initialization (CF-P7-005, surface 4).
//
// The largest gap inherited from Phase 6. The device register, the workspace key
// envelope, and the provisioning services all exist and are proven, but until
// now nothing reached them: closing G2 and G3 in Phase 6 meant driving these
// calls by hand. This module turns that manual sequence into a journey.
//
// It owns no crypto. Key generation, protection, unlocking, and re-binding all
// live in `device-key-lifecycle.js`; the network calls all belong to services
// that already exist. What lives here is the order those steps must happen in,
// the checks between them, and how the result is explained to a person.
//
// The order is forced by two contracts that do not quite meet. `POST
// /api/v1/devices` carries the public key in its body, so the pair must exist
// before registration; but the server derives the device id itself and ignores
// any the client proposes, while enrolment binds the stored key to a device id.
// Enrol first under a local id, register, then re-bind onto the id the server
// assigned. Re-enrolling instead would generate a different pair, leaving the
// registered fingerprint pointing at a key this browser no longer holds — and
// every workspace envelope later provisioned to it would be undecryptable.

import { unsupportedBrowserGuidance } from './device-key-lifecycle.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The frozen suite. The server rejects anything else outright. */
export const DEVICE_SUITE = 'P256-HKDF-SHA256-A256GCM-v1';

/** The four actions the frozen contract gives this surface. */
export const DEVICE_ACTIONS = Object.freeze([
    'register-device', 'show-fingerprint', 'await-provisioning', 'revoke-device'
]);

/** Every state the journey can be observed in. */
export const DEVICE_STATUSES = Object.freeze([
    'unsupported',  // the browser cannot hold a key safely; nothing else is offered
    'unregistered', // supported, nothing enrolled here yet
    'enrolling',    // generating and protecting the key pair locally
    'registering',  // sending the public key; the server assigns the device id
    'rebinding',    // moving the local key onto the assigned id
    'registered',   // this browser holds a key the server knows about
    'revoking',
    'revoked',
    'failed'
]);

/**
 * Workspace key readiness, exactly as the server reports it.
 *
 * Frozen by CF-P5-005 as `WorkspaceKeyReadiness` in
 * `functions/_lib/workspace-keys/workspace-key-service.ts`. Five values,
 * rendered and never extended.
 *
 * `pending_key` and `stale_key` are deliberately kept apart even though both
 * mean "you are waiting". One is waiting for a first envelope, the other for a
 * replacement after the key version moved on; telling a user who already had
 * access that they are waiting to be granted it is a different and more
 * confusing message than telling them their copy went out of date.
 */
export const KEY_READINESS = Object.freeze([
    'key_ready', 'pending_key', 'stale_key', 'not_entitled', 'revoked'
]);

const READINESS = Object.freeze({
    key_ready: {
        waiting: false, blocked: false,
        title: 'This device can open the workspace',
        reason: 'The workspace key is available to this device.'
    },
    pending_key: {
        waiting: true, blocked: false,
        title: 'Waiting for access to the workspace key',
        reason: 'An owner or admin who already has the key has to provision it to this device. '
            + 'Share the fingerprint below so they can check they are provisioning the right one.'
    },
    stale_key: {
        waiting: true, blocked: false,
        title: 'This device holds an old key version',
        reason: 'The workspace key moved on, so the copy on this device is out of date. An owner '
            + 'or admin has to provision the current version to this device.'
    },
    not_entitled: {
        waiting: false, blocked: true,
        title: 'No access to this workspace',
        reason: 'This account is not a member of this workspace. If it was a member until '
            + 'recently, re-entry is through the workspace switcher, not by retrying here.'
    },
    revoked: {
        waiting: false, blocked: true,
        title: 'This device was revoked',
        reason: 'Register this browser as a device again to regain access.'
    }
});

export class DeviceInitializationError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'DeviceInitializationError';
        this.code = code;
    }
}

const fail = code => { throw new DeviceInitializationError(code); };

/**
 * Group a fingerprint for reading aloud.
 *
 * This is the whole point of `show-fingerprint`: two people compare it out loud
 * or over another channel before one of them provisions a key to the other's
 * device. An unbroken 43-character string is read wrongly; four-character groups
 * are not. The value is never altered, only spaced.
 *
 * @param {string} value
 */
export function formatFingerprint(value) {
    if (typeof value !== 'string' || value.length < 8) fail('INVALID_FINGERPRINT');
    return (value.match(/.{1,4}/g) ?? []).join(' ');
}

/**
 * How a readiness value is presented. Every one explains itself.
 *
 * @param {string} readiness
 */
export function presentReadiness(readiness) {
    if (!KEY_READINESS.includes(readiness)) fail('UNKNOWN_READINESS');
    return Object.freeze({ readiness, ...READINESS[readiness] });
}

/**
 * Describe the surface.
 *
 * @param {{session: {authenticated: boolean|null}, status?: string,
 *          device?: {deviceId: string, fingerprint: string, state: string}|null,
 *          readiness?: string|null, guidance?: string|null, failure?: object|null}} input
 */
export function deviceInitializationModel({ session, status = 'unregistered', device = null,
    readiness = null, guidance = null, failure = null } = {}) {
    if (!session || typeof session !== 'object') fail('SESSION_REQUIRED');
    if (!DEVICE_STATUSES.includes(status)) fail('INVALID_STATUS');
    if (device !== null && !UUID_V4.test(device.deviceId ?? '')) fail('INVALID_DEVICE');
    if (readiness !== null && !KEY_READINESS.includes(readiness)) fail('UNKNOWN_READINESS');

    const authenticated = session.authenticated === true;
    const inFlight = status === 'enrolling' || status === 'registering'
        || status === 'rebinding' || status === 'revoking';

    let blocked = null;
    if (status === 'unsupported') {
        // The Phase 5 guidance is a {code, title, action} record, not a string.
        // Both halves are shown: the title alone says what is wrong without
        // saying what to do, and the action alone lacks its subject.
        blocked = guidance === null
            ? 'This browser cannot store a device key safely.'
            : `${guidance.title}. ${guidance.action}`;
    } else if (session.authenticated !== true && session.authenticated !== false) {
        blocked = 'Checking your session.';
    } else if (!authenticated) {
        blocked = 'Sign in with GitHub to set up this device.';
    }

    return Object.freeze({
        status,
        authenticated,
        supported: status !== 'unsupported',
        deviceId: device === null ? null : device.deviceId,
        // Never rendered raw: an ungrouped fingerprint is read wrongly aloud,
        // and reading it aloud is what it is for.
        fingerprint: device === null ? null : formatFingerprint(device.fingerprint),
        deviceState: device === null ? null : device.state,
        readiness: readiness === null ? null : presentReadiness(readiness),
        // A key this device is waiting for is not an error and must not be
        // rendered as one; someone else simply has not acted yet.
        waiting: readiness !== null && READINESS[readiness].waiting,
        blocked,
        canRegister: blocked === null && !inFlight && device === null,
        canRevoke: blocked === null && !inFlight && device !== null && device.state === 'active',
        inFlight,
        failure: failure === null ? null : Object.freeze({ ...failure })
    });
}

/**
 * Build the nodes. Decides nothing.
 *
 * @param {Document} doc
 * @param {ReturnType<typeof deviceInitializationModel>} model
 */
export function renderDeviceInitialization(doc, model) {
    if (!doc || typeof doc.createElement !== 'function') fail('DOCUMENT_REQUIRED');
    if (!model || !DEVICE_STATUSES.includes(model.status)) fail('MODEL_REQUIRED');

    const root = doc.createElement('section');
    root.className = `collab-device collab-device--${model.status}`;
    root.setAttribute('data-collab-surface', 'device-key-initialization');
    root.setAttribute('data-device-status', model.status);

    const heading = doc.createElement('h2');
    heading.className = 'collab-device__heading';
    heading.textContent = 'This device';
    root.appendChild(heading);

    if (model.fingerprint !== null) {
        const label = doc.createElement('p');
        label.className = 'collab-device__fingerprint-label';
        label.id = 'collab-device-fingerprint-label';
        label.textContent = 'Fingerprint';
        root.appendChild(label);

        const fingerprint = doc.createElement('p');
        fingerprint.className = 'collab-device__fingerprint';
        fingerprint.setAttribute('data-collab-action', 'show-fingerprint');
        fingerprint.setAttribute('aria-describedby', 'collab-device-fingerprint-label');
        fingerprint.textContent = model.fingerprint;
        root.appendChild(fingerprint);
    }

    if (model.readiness !== null) {
        const readiness = doc.createElement('div');
        readiness.className = `collab-device__readiness collab-device__readiness--${model.readiness.readiness}`;
        readiness.setAttribute('data-readiness', model.readiness.readiness);
        readiness.setAttribute('data-collab-action', 'await-provisioning');
        readiness.setAttribute('role', 'status');
        readiness.setAttribute('aria-live', 'polite');
        if (model.waiting) readiness.setAttribute('aria-busy', 'true');

        const shape = doc.createElement('span');
        shape.className = `collab-device__shape collab-device__shape--${model.readiness.readiness}`;
        shape.setAttribute('aria-hidden', 'true');
        readiness.appendChild(shape);

        const title = doc.createElement('p');
        title.className = 'collab-device__readiness-title';
        title.textContent = model.readiness.title;
        readiness.appendChild(title);

        const reason = doc.createElement('p');
        reason.className = 'collab-device__readiness-reason';
        reason.textContent = model.readiness.reason;
        readiness.appendChild(reason);
        root.appendChild(readiness);
    }

    const register = doc.createElement('button');
    register.type = 'button';
    register.className = 'collab-device__register';
    register.setAttribute('data-collab-action', 'register-device');
    register.textContent = 'Set up this device';
    if (!model.canRegister) {
        register.disabled = true;
        register.setAttribute('aria-disabled', 'true');
        register.setAttribute('title', model.blocked
            ?? (model.deviceId !== null ? 'This device is already set up.' : 'Working…'));
    }
    root.appendChild(register);

    const revoke = doc.createElement('button');
    revoke.type = 'button';
    revoke.className = 'collab-device__revoke';
    revoke.setAttribute('data-collab-action', 'revoke-device');
    revoke.textContent = 'Revoke this device';
    if (!model.canRevoke) {
        revoke.disabled = true;
        revoke.setAttribute('aria-disabled', 'true');
        revoke.setAttribute('title', model.blocked
            ?? (model.deviceId === null ? 'There is nothing set up on this browser yet.' : 'Working…'));
    }
    root.appendChild(revoke);

    if (model.blocked !== null) {
        const blocked = doc.createElement('p');
        blocked.className = 'collab-device__blocked';
        blocked.textContent = model.blocked;
        root.appendChild(blocked);
    }

    const status = doc.createElement('p');
    status.className = 'collab-device__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    if (model.inFlight) status.setAttribute('aria-busy', 'true');
    status.textContent = STATUS_LABELS[model.status];
    root.appendChild(status);

    if (model.failure !== null) {
        const failureNode = doc.createElement('p');
        failureNode.className = 'collab-device__failure';
        failureNode.setAttribute('role', 'alert');
        failureNode.setAttribute('data-failure-code', model.failure.code);
        failureNode.textContent = model.failure.reason;
        root.appendChild(failureNode);
    }
    return root;
}

const STATUS_LABELS = Object.freeze({
    unsupported: 'This browser cannot be set up as a device.',
    unregistered: 'This browser is not set up yet.',
    enrolling: 'Creating a key on this device. It never leaves this browser.',
    registering: 'Registering this device.',
    rebinding: 'Finishing setup.',
    registered: 'This device is set up.',
    revoking: 'Revoking this device.',
    revoked: 'This device was revoked. Its local key has been deleted.',
    failed: 'Setup stopped. Nothing was left half-registered.'
});

/**
 * Register this browser as a device.
 *
 * Order, and why it cannot be otherwise:
 *
 * 1. **enrol** under a locally generated id — the public key must exist before
 *    registration can carry it;
 * 2. **register** — the server assigns the real device id and echoes back the
 *    fingerprint it stored;
 * 3. **compare** that fingerprint against the one just enrolled, before
 *    anything is bound to it;
 * 4. **re-bind** the local key onto the assigned id.
 *
 * Step 3 is not ceremony. If the server stored a different fingerprint than this
 * browser holds, every envelope later provisioned to this device would be sealed
 * to a key that cannot open it, and the failure would surface much later as an
 * undecryptable workspace rather than here as a refused setup.
 *
 * @param {{lifecycle: object, api: object, newDeviceId: () => string,
 *          newIdempotencyKey: () => string, unlockSecret: Uint8Array,
 *          displayLabel?: string, onStep?: (status: string) => void}} input
 */
export async function runDeviceRegistration({ lifecycle, api, newDeviceId, newIdempotencyKey,
    unlockSecret, displayLabel, onStep } = {}) {
    if (!lifecycle || typeof lifecycle.enroll !== 'function'
        || typeof lifecycle.rebindDeviceId !== 'function'
        || typeof lifecycle.changeContext !== 'function') fail('LIFECYCLE_REQUIRED');
    if (!api || typeof api.registerDevice !== 'function') fail('API_REQUIRED');
    if (typeof newDeviceId !== 'function') fail('DEVICE_ID_SOURCE_REQUIRED');
    if (typeof newIdempotencyKey !== 'function') fail('IDEMPOTENCY_KEY_REQUIRED');
    const step = typeof onStep === 'function' ? onStep : () => {};

    const localDeviceId = newDeviceId();
    if (!UUID_V4.test(localDeviceId)) fail('INVALID_DEVICE');
    const requestKey = newIdempotencyKey();

    step('enrolling');
    lifecycle.changeContext({ ...lifecycle.context, deviceId: localDeviceId });
    const enrolled = await lifecycle.enroll(unlockSecret);
    if (!enrolled || typeof enrolled.fingerprint !== 'string') fail('ENROLMENT_INCOMPLETE');

    step('registering');
    const registered = await api.registerDevice({
        publicJwk: enrolled.publicJwk,
        fingerprint: enrolled.fingerprint,
        suite: DEVICE_SUITE,
        displayLabel,
        idempotencyKey: requestKey
    });
    if (!registered || !UUID_V4.test(registered.deviceId ?? '')) fail('REGISTRATION_INCOMPLETE');
    if (registered.fingerprint !== enrolled.fingerprint) fail('FINGERPRINT_MISMATCH');

    step('rebinding');
    await lifecycle.rebindDeviceId(registered.deviceId, unlockSecret);

    step('registered');
    return Object.freeze({
        status: 'registered',
        deviceId: registered.deviceId,
        fingerprint: enrolled.fingerprint,
        // Carried so a caller can seal a workspace envelope to this device
        // without re-deriving a public key from a non-extractable private one.
        // Never secret: this is the value `POST /devices` was just handed.
        publicJwk: enrolled.publicJwk,
        idempotencyKey: requestKey
    });
}

/**
 * Ask what this device's standing is against one workspace.
 *
 * @param {{api: object, workspaceId: string}} input
 */
export async function readKeyReadiness({ api, workspaceId } = {}) {
    if (!api || typeof api.readCurrentKeyEnvelope !== 'function') fail('API_REQUIRED');
    if (!UUID_V4.test(workspaceId ?? '')) fail('INVALID_WORKSPACE');
    const result = await api.readCurrentKeyEnvelope({ workspaceId });
    const readiness = result?.readiness;
    if (!KEY_READINESS.includes(readiness)) fail('UNKNOWN_READINESS');
    return Object.freeze({
        readiness,
        presentation: presentReadiness(readiness),
        hasEnvelope: readiness === 'key_ready' && result.envelope !== null
    });
}

/**
 * Revoke this device: the server first, then the local key.
 *
 * The order matters and is not symmetric. Deleting locally first would leave the
 * server still treating this device as active while the key that makes it usable
 * is gone — an entry nobody can use and nobody can tell is dead. Server first
 * means a failure leaves the device fully working rather than half dead.
 *
 * @param {{lifecycle: object, api: object, deviceId: string,
 *          newIdempotencyKey: () => string, onStep?: (status: string) => void}} input
 */
export async function runDeviceRevocation({ lifecycle, api, deviceId, newIdempotencyKey,
    onStep } = {}) {
    if (!lifecycle || typeof lifecycle.revokeLocalDevice !== 'function') fail('LIFECYCLE_REQUIRED');
    if (!api || typeof api.revokeDevice !== 'function') fail('API_REQUIRED');
    if (!UUID_V4.test(deviceId ?? '')) fail('INVALID_DEVICE');
    if (typeof newIdempotencyKey !== 'function') fail('IDEMPOTENCY_KEY_REQUIRED');
    const step = typeof onStep === 'function' ? onStep : () => {};

    step('revoking');
    await api.revokeDevice({ deviceId, idempotencyKey: newIdempotencyKey() });
    await lifecycle.revokeLocalDevice();
    step('revoked');
    return Object.freeze({ status: 'revoked', deviceId });
}

/**
 * Turn an unsupported-browser error into something actionable.
 *
 * Delegated to the Phase 5 module rather than restated, so the guidance cannot
 * drift away from the capability check that produced it.
 *
 * @param {Error} error
 */
export function unsupportedGuidance(error) {
    return unsupportedBrowserGuidance(error);
}
