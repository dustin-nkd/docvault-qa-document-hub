// Create workspace journey (CF-P7-004, surface 3).
//
// The API contract makes this two calls with a hard ordering rule between them.
// `POST /workspaces/bootstrap-intents` returns the binding — the opaque
// workspace id the server derived, the initial key version, and the owner
// device fingerprint — and mutates nothing. The client generates the workspace
// DEK and the creator envelope *only after* that binding arrives, because the
// envelope is bound to values the client does not get to choose. `POST
// /workspaces` then commits with the SAME Idempotency-Key.
//
// This module owns the journey, never the primitives. It does not derive the
// workspace id, mint key material, or implement idempotency: the id comes from
// the intent response, the sealing is delegated to the Phase 5 key services,
// and the idempotency rule it enforces is the contract's own — one key for both
// calls, and the same key again on retry.
//
// That retry rule is the sharpest edge here. A create that fails after the
// mutation reached D1 is indistinguishable from one that failed before it. If a
// retry minted a fresh key the server would treat it as a new request and the
// user would end up with two workspaces, one of which they never asked for.

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/** The three actions the frozen contract gives this surface, in order. */
export const CREATE_WORKSPACE_STEPS = Object.freeze([
    'name-workspace',
    'bootstrap-key',
    'create'
]);

/** Every state the journey can be observed in. */
export const CREATE_WORKSPACE_STATUSES = Object.freeze([
    'naming',   // collecting the name; nothing has been sent
    'binding',  // the intent is in flight; still no mutation server-side
    'sealing',  // generating the DEK and creator envelope against the binding
    'creating', // the atomic create is in flight
    'created',  // committed, and the new workspace is now the selection
    'failed'    // stopped with a stated reason; never retried automatically
]);

/**
 * Mirrors the server rule in `functions/_lib/workspaces/workspace-bootstrap.ts`.
 *
 * Mirroring is presentation, not authority: it exists so the user is told before
 * they submit rather than after, which the contract requires of every control it
 * forbids to "fail only on submit". The server still validates, and a name this
 * module accepts can still be rejected — nothing here treats local validity as
 * acceptance.
 */
export const NAME_RULE = Object.freeze({ minCodePoints: 1, maxCodePoints: 80 });

/**
 * The frozen error taxonomy mapped to presentation, per the contract §4.
 *
 * The values are the contract's own strings, not a paraphrase of them, so the
 * gate can compare this table against the frozen one directly instead of
 * matching two vocabularies that drift apart quietly.
 *
 * Twenty-nine rows since CF-P7-016, which corrected §4 from twelve — two of them
 * under spellings the server catalog does not contain — to the whole catalog.
 * This table mirrors all of it; `CREATE_WORKSPACE_CODES` below is the subset
 * these two routes can actually return, and that subset is unchanged.
 */
export const PRESENTATION_BY_CODE = Object.freeze({
    INVALID_JSON: 'error',
    VALIDATION_FAILED: 'error',
    INVALID_CURSOR: 'error',
    INVALID_PRECONDITION: 'error',
    AUTHENTICATION_REQUIRED: 'unauthorized',
    SESSION_EXPIRED: 'unauthorized',
    REAUTHENTICATION_REQUIRED: 'unauthorized',
    CSRF_REJECTED: 'error',
    DEVICE_NOT_AUTHORIZED: 'error',
    KEY_PROVISIONING_REQUIRED: 'error',
    OPERATION_NOT_PERMITTED: 'role-disabled-explanation',
    RESOURCE_NOT_FOUND: 'empty-or-access-removed',
    METHOD_NOT_ALLOWED: 'error',
    NOT_ACCEPTABLE: 'error',
    DOCUMENT_REVISION_CONFLICT: 'Conflict',
    IDEMPOTENCY_KEY_REUSED: 'error',
    IDEMPOTENCY_WINDOW_EXPIRED: 'error',
    STATE_TRANSITION_INVALID: 'error',
    KEY_VERSION_MISMATCH: 'error',
    FINGERPRINT_CHANGED: 'error',
    INVITATION_UNAVAILABLE: 'error',
    LAST_OWNER_REQUIRED: 'role-disabled-explanation',
    LIFECYCLE_POLICY_UNAVAILABLE: 'error',
    PAYLOAD_TOO_LARGE: 'error',
    UNSUPPORTED_MEDIA_TYPE: 'error',
    UNSUPPORTED_ENVELOPE: 'error',
    RATE_LIMITED: 'error',
    INTERNAL_ERROR: 'error',
    COLLABORATION_UNAVAILABLE: 'error'
});

/**
 * The subset those two routes can actually return.
 *
 * A code outside this set is a defect, not a user situation, and is reported as
 * one rather than being flattened into the generic error bucket where it would
 * never be noticed.
 */
export const CREATE_WORKSPACE_CODES = Object.freeze([
    'AUTHENTICATION_REQUIRED', 'REAUTHENTICATION_REQUIRED', 'OPERATION_NOT_PERMITTED',
    'VALIDATION_FAILED', 'KEY_VERSION_MISMATCH', 'IDEMPOTENCY_KEY_REUSED',
    'IDEMPOTENCY_WINDOW_EXPIRED', 'RATE_LIMITED', 'COLLABORATION_UNAVAILABLE',
    'CSRF_REJECTED'
]);

const REASON_BY_CODE = Object.freeze({
    AUTHENTICATION_REQUIRED: 'Your session ended. Sign in again to create this workspace.',
    REAUTHENTICATION_REQUIRED: 'This action needs a fresh sign-in. Sign in again to continue.',
    OPERATION_NOT_PERMITTED: 'Your account is not allowed to create a workspace.',
    VALIDATION_FAILED: 'The server rejected this workspace name. Try a different one.',
    KEY_VERSION_MISMATCH: 'The workspace key version moved on. Start the journey again.',
    IDEMPOTENCY_KEY_REUSED: 'This request key was already used for a different request.',
    IDEMPOTENCY_WINDOW_EXPIRED: 'This attempt is too old to resume. Start the journey again.',
    RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
    COLLABORATION_UNAVAILABLE: 'Collaboration is unavailable right now. Try again shortly.',
    CSRF_REJECTED: 'The request could not be verified. Reload the page and try again.'
});

const NAME_REASONS = Object.freeze({
    required: 'Enter a name for this workspace.',
    'too-long': `Use ${NAME_RULE.maxCodePoints} characters or fewer.`,
    untrimmed: 'Remove the spaces at the start or end of the name.',
    'control-character': 'Remove the invisible control characters from the name.'
});

export class CreateWorkspaceError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'CreateWorkspaceError';
        this.code = code;
    }
}

const fail = code => { throw new CreateWorkspaceError(code); };

/**
 * Check a name the way the server will.
 *
 * Counts code points, not UTF-16 units, because the server counts code points.
 * Using `.length` would reject a legitimate 41-emoji name and accept nothing the
 * server would not — a mirror that is stricter than its original is still wrong,
 * because it blocks a name the product actually allows.
 *
 * @param {string} value
 * @returns {{valid: boolean, reason: string|null, message: string|null}}
 */
export function validateDisplayName(value) {
    const rejected = reason => Object.freeze({ valid: false, reason, message: NAME_REASONS[reason] });
    if (typeof value !== 'string' || value.trim().length === 0) return rejected('required');
    if (value !== value.trim()) return rejected('untrimmed');
    if (CONTROL_CHARACTER.test(value)) return rejected('control-character');
    const codePoints = [...value].length;
    if (codePoints < NAME_RULE.minCodePoints) return rejected('required');
    if (codePoints > NAME_RULE.maxCodePoints) return rejected('too-long');
    return Object.freeze({ valid: true, reason: null, message: null });
}

/**
 * Turn a server code into something the surface can render and a person can read.
 *
 * @param {string} code
 */
export function presentFailure(code) {
    const expected = CREATE_WORKSPACE_CODES.includes(code);
    if (!expected) {
        return Object.freeze({
            code: typeof code === 'string' && code.length > 0 ? code : 'UNKNOWN',
            presentation: 'error',
            expected: false,
            reason: 'The server returned a response this journey cannot happen to produce. '
                + 'Nothing was created. Report this if it repeats.'
        });
    }
    return Object.freeze({
        code,
        presentation: PRESENTATION_BY_CODE[code],
        expected: true,
        reason: REASON_BY_CODE[code]
    });
}

/**
 * Describe the surface.
 *
 * `blocked` is the interesting field. Creating a workspace needs an active own
 * device, because the creator envelope has to be sealed to one. When there is no
 * such device the submit control stays visible and disabled and says so, and
 * points at the device journey — the contract forbids hiding it, and forbids
 * letting it look enabled and fail on submit.
 *
 * @param {{session: {authenticated: boolean|null},
 *          device: {deviceId: string, status: string}|null,
 *          name?: string, status?: string,
 *          failure?: ReturnType<typeof presentFailure>|null}} input
 */
export function createWorkspaceModel({ session, device, name = '', status = 'naming',
    failure = null } = {}) {
    if (!session || typeof session !== 'object') fail('SESSION_REQUIRED');
    if (!CREATE_WORKSPACE_STATUSES.includes(status)) fail('INVALID_STATUS');
    if (device !== null && device !== undefined && !UUID_V4.test(device.deviceId ?? '')) {
        fail('INVALID_DEVICE');
    }
    const authenticated = session.authenticated === true;
    const deviceReady = Boolean(device) && device.status === 'active';
    const nameCheck = validateDisplayName(name);
    const inFlight = status === 'binding' || status === 'sealing' || status === 'creating';

    let blocked = null;
    if (session.authenticated !== true && session.authenticated !== false) {
        blocked = 'Checking your session.';
    } else if (!authenticated) {
        blocked = 'Sign in with GitHub to create a workspace.';
    } else if (!deviceReady) {
        blocked = 'Set up this device first. A workspace key has to be sealed to an active device.';
    }

    return Object.freeze({
        status,
        steps: Object.freeze(CREATE_WORKSPACE_STEPS.map((step, index) => Object.freeze({
            step,
            state: stepState(index, status)
        }))),
        name,
        nameValid: nameCheck.valid,
        nameMessage: nameCheck.message,
        authenticated,
        deviceReady,
        deviceId: deviceReady ? device.deviceId : null,
        blocked,
        // Never enabled where submitting would fail: every precondition is
        // checked here, not discovered by the server.
        canSubmit: blocked === null && nameCheck.valid && !inFlight && status !== 'created',
        inFlight,
        failure: failure === null ? null : Object.freeze({ ...failure })
    });
}

/**
 * Which of the three steps a status is working on.
 *
 * `binding` and `sealing` share step 2 on purpose: reserving the id and sealing
 * the key are one thing to the user, and the contract's action is `bootstrap-key`.
 * Splitting them in the interface would expose an ordering rule that exists for
 * the protocol's sake, not the user's.
 */
const ACTIVE_STEP = Object.freeze({
    naming: 0, binding: 1, sealing: 1, creating: 2, created: 3
});

function stepState(index, status) {
    if (status === 'failed') return 'stopped';
    const active = ACTIVE_STEP[status];
    if (index < active) return 'done';
    return index === active ? 'active' : 'pending';
}

/**
 * Build the nodes. Decides nothing; every judgement is already in the model.
 *
 * @param {Document} doc
 * @param {ReturnType<typeof createWorkspaceModel>} model
 */
export function renderCreateWorkspace(doc, model) {
    if (!doc || typeof doc.createElement !== 'function') fail('DOCUMENT_REQUIRED');
    if (!model || !CREATE_WORKSPACE_STATUSES.includes(model.status)) fail('MODEL_REQUIRED');

    const root = doc.createElement('form');
    root.className = `collab-create collab-create--${model.status}`;
    root.setAttribute('data-collab-surface', 'create-workspace');
    root.setAttribute('data-create-status', model.status);
    root.setAttribute('novalidate', 'novalidate');

    const heading = doc.createElement('h2');
    heading.className = 'collab-create__heading';
    heading.textContent = 'Create a workspace';
    root.appendChild(heading);

    const label = doc.createElement('label');
    label.className = 'collab-create__label';
    label.setAttribute('for', 'collab-create-name');
    label.textContent = 'Workspace name';
    root.appendChild(label);

    const input = doc.createElement('input');
    input.className = 'collab-create__input';
    input.type = 'text';
    input.id = 'collab-create-name';
    input.setAttribute('name', 'displayName');
    input.setAttribute('value', model.name);
    input.setAttribute('maxlength', String(NAME_RULE.maxCodePoints));
    input.setAttribute('aria-describedby', 'collab-create-hint');
    if (model.nameMessage !== null && model.name.length > 0) {
        input.setAttribute('aria-invalid', 'true');
    }
    if (model.inFlight) input.disabled = true;
    root.appendChild(input);

    const hint = doc.createElement('p');
    hint.className = 'collab-create__hint';
    hint.id = 'collab-create-hint';
    hint.textContent = model.nameMessage !== null && model.name.length > 0
        ? model.nameMessage
        : `Up to ${NAME_RULE.maxCodePoints} characters. Everyone you invite will see this name.`;
    root.appendChild(hint);

    const steps = doc.createElement('ol');
    steps.className = 'collab-create__steps';
    for (const item of model.steps) {
        const entry = doc.createElement('li');
        entry.className = `collab-create__step collab-create__step--${item.state}`;
        entry.setAttribute('data-step', item.step);
        entry.setAttribute('data-step-state', item.state);
        const shape = doc.createElement('span');
        shape.className = `collab-create__shape collab-create__shape--${item.state}`;
        shape.setAttribute('aria-hidden', 'true');
        entry.appendChild(shape);
        const text = doc.createElement('span');
        text.className = 'collab-create__step-label';
        text.textContent = STEP_LABELS[item.step];
        entry.appendChild(text);
        steps.appendChild(entry);
    }
    root.appendChild(steps);

    const submit = doc.createElement('button');
    submit.type = 'submit';
    submit.className = 'collab-create__submit';
    submit.setAttribute('data-collab-action', 'workspace-create-submit');
    submit.textContent = model.status === 'created' ? 'Workspace created' : 'Create workspace';
    if (!model.canSubmit) {
        submit.disabled = true;
        submit.setAttribute('aria-disabled', 'true');
        const why = model.blocked ?? model.nameMessage ?? 'Working…';
        submit.setAttribute('title', why);
        submit.setAttribute('aria-describedby', 'collab-create-blocked');
    }
    root.appendChild(submit);

    if (model.blocked !== null) {
        const reason = doc.createElement('p');
        reason.className = 'collab-create__blocked';
        reason.id = 'collab-create-blocked';
        reason.textContent = model.blocked;
        root.appendChild(reason);
        if (!model.deviceReady && model.authenticated) {
            const action = doc.createElement('button');
            action.type = 'button';
            action.className = 'collab-create__device-action';
            action.setAttribute('data-collab-action', 'device-setup-open');
            action.textContent = 'Set up this device';
            root.appendChild(action);
        }
    }

    const status = doc.createElement('p');
    status.className = 'collab-create__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    if (model.inFlight) status.setAttribute('aria-busy', 'true');
    status.textContent = STATUS_LABELS[model.status];
    root.appendChild(status);

    if (model.failure !== null) {
        const failureNode = doc.createElement('p');
        failureNode.className = 'collab-create__failure';
        failureNode.setAttribute('role', 'alert');
        failureNode.setAttribute('data-failure-code', model.failure.code);
        failureNode.setAttribute('data-failure-presentation', model.failure.presentation);
        failureNode.textContent = model.failure.reason;
        root.appendChild(failureNode);
    }
    return root;
}

const STEP_LABELS = Object.freeze({
    'name-workspace': 'Name the workspace',
    'bootstrap-key': 'Create its key on this device',
    create: 'Create the workspace'
});

const STATUS_LABELS = Object.freeze({
    naming: 'Nothing has been sent yet.',
    binding: 'Reserving the workspace. Nothing has been created yet.',
    sealing: 'Creating the workspace key on this device.',
    creating: 'Creating the workspace.',
    created: 'Workspace created. You are now in it.',
    failed: 'Stopped. Nothing was left half-created.'
});

function requireBinding(binding, ownerDeviceId) {
    if (!binding || typeof binding !== 'object') fail('BINDING_REQUIRED');
    if (!UUID_V4.test(binding.workspaceId ?? '')) fail('BINDING_WORKSPACE_INVALID');
    if (binding.initialKeyVersion !== 1) fail('BINDING_KEY_VERSION_INVALID');
    // Seal to the device the server bound, never to the one we asked about.
    if (binding.ownerDeviceId !== ownerDeviceId) fail('BINDING_DEVICE_MISMATCH');
    if (typeof binding.ownerFingerprint !== 'string' || binding.ownerFingerprint.length === 0) {
        fail('BINDING_FINGERPRINT_INVALID');
    }
    return binding;
}

/**
 * Run the journey.
 *
 * Every collaborator is injected: `api` performs the two calls, `keys` seals the
 * creator envelope, `selection` is the CF-P7-003 workspace selection, and
 * `newIdempotencyKey` mints request keys. Nothing here reaches for a global, and
 * nothing here retries on its own.
 *
 * Pass `idempotencyKey` to resume a previous attempt. Resuming with the original
 * key is the only safe retry: a fresh key would read as a second request and
 * could leave the user with a workspace they never asked for.
 *
 * @param {{api: object, keys: object, selection: object, newIdempotencyKey: () => string,
 *          displayName: string, ownerDeviceId: string, idempotencyKey?: string,
 *          onStep?: (status: string) => void}} input
 */
export async function runCreateWorkspace({ api, keys, selection, newIdempotencyKey,
    displayName, ownerDeviceId, idempotencyKey, onStep } = {}) {
    if (!api || typeof api.createBootstrapIntent !== 'function'
        || typeof api.createWorkspace !== 'function') fail('API_REQUIRED');
    if (!keys || typeof keys.sealCreatorEnvelope !== 'function') fail('KEYS_REQUIRED');
    if (!selection || typeof selection.write !== 'function') fail('SELECTION_REQUIRED');
    if (!UUID_V4.test(ownerDeviceId ?? '')) fail('INVALID_DEVICE');
    const nameCheck = validateDisplayName(displayName);
    if (!nameCheck.valid) fail('INVALID_NAME');

    // One key for the intent and the create, and the same one again on resume.
    const requestKey = typeof idempotencyKey === 'string' && idempotencyKey.length > 0
        ? idempotencyKey
        : newIdempotencyKey();
    if (typeof requestKey !== 'string' || requestKey.length === 0) fail('IDEMPOTENCY_KEY_REQUIRED');
    const step = typeof onStep === 'function' ? onStep : () => {};
    const stopped = failure => Object.freeze({
        status: 'failed', workspaceId: null, idempotencyKey: requestKey, failure
    });

    try {
        step('binding');
        const binding = requireBinding(
            await api.createBootstrapIntent({ displayName, ownerDeviceId, idempotencyKey: requestKey }),
            ownerDeviceId
        );

        // Only now: the envelope is bound to values the server chose.
        step('sealing');
        const sealed = await keys.sealCreatorEnvelope({
            workspaceId: binding.workspaceId,
            keyVersion: binding.initialKeyVersion,
            ownerDeviceId: binding.ownerDeviceId,
            ownerFingerprint: binding.ownerFingerprint
        });
        if (!sealed || typeof sealed.envelope === 'undefined') fail('ENVELOPE_REQUIRED');

        step('creating');
        const created = await api.createWorkspace({
            displayName,
            ownerDeviceId: binding.ownerDeviceId,
            idempotencyKey: requestKey,
            workspaceId: binding.workspaceId,
            creatorEnvelope: sealed.envelope
        });
        if (!created || created.workspaceId !== binding.workspaceId) fail('WORKSPACE_ID_MISMATCH');

        // Landing in the workspace just created is the user's own explicit
        // action, which is why writing the selection here is not the silent
        // substitution CF-P7-003 refuses to do.
        selection.write(created.workspaceId);
        step('created');
        return Object.freeze({
            status: 'created',
            workspaceId: created.workspaceId,
            idempotencyKey: requestKey,
            failure: null
        });
    } catch (error) {
        if (error instanceof CreateWorkspaceError) throw error;
        const failure = presentFailure(error?.code);
        step('failed');
        return stopped(failure);
    }
}
