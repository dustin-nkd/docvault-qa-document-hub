// CF-P7-005 — device and key initialization.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    DEVICE_ACTIONS, DEVICE_STATUSES, DEVICE_SUITE, KEY_READINESS,
    DeviceInitializationError, formatFingerprint, presentReadiness,
    deviceInitializationModel, renderDeviceInitialization,
    runDeviceRegistration, readKeyReadiness, runDeviceRevocation, unsupportedGuidance
} from '../js/collaboration/device-initialization.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const LOCAL_ID = '88888888-8888-4888-8888-888888888888';
const SERVER_ID = '99999999-9999-4999-8999-999999999999';
const WORKSPACE = '55555555-5555-4555-8555-555555555555';
const USER = '11111111-1111-4111-8111-111111111111';
const FINGERPRINT = 'abcdEFGH1234ijklMNOP5678qrstUVWX90';

const signedIn = { authenticated: true };

// ── minimal DOM ──────────────────────────────────────────────────────────────

function element(tagName) {
    const node = {
        tagName, children: [], attributes: new Map(), className: '', textContent: '',
        type: '', id: '', hidden: false, disabled: false, focused: false,
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        removeAttribute(name) { this.attributes.delete(name); },
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...nodes) { this.children = nodes; },
        focus() { this.focused = true; },
        querySelector(selector) { return descendants(this).find(matches(selector)) ?? null; },
        querySelectorAll(selector) { return descendants(this).filter(matches(selector)); }
    };
    return node;
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const matches = selector => node => {
    if (selector.startsWith('.')) return node.className.split(' ').includes(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) {
        const value = node.getAttribute(attribute[1]);
        return attribute[2] === undefined ? value !== null : value === attribute[2];
    }
    return node.tagName === selector;
};
const doc = { createElement: element };

// ── doubles ──────────────────────────────────────────────────────────────────

function harness(overrides = {}) {
    const calls = [];
    const lifecycle = {
        context: { userId: USER, deviceId: LOCAL_ID, workspaceId: WORKSPACE },
        changeContext(next) { calls.push({ call: 'changeContext', next }); this.context = next; },
        async enroll() {
            calls.push({ call: 'enroll', deviceId: this.context.deviceId });
            if (overrides.enrollError) throw overrides.enrollError;
            return { publicJwk: { kty: 'EC', crv: 'P-256' },
                fingerprint: overrides.enrolledFingerprint ?? FINGERPRINT };
        },
        async rebindDeviceId(next) {
            calls.push({ call: 'rebind', next });
            if (overrides.rebindError) throw overrides.rebindError;
            return { rebound: true, fingerprint: FINGERPRINT };
        },
        async revokeLocalDevice() { calls.push({ call: 'revokeLocal' }); }
    };
    const api = {
        async registerDevice(input) {
            calls.push({ call: 'register', input });
            if (overrides.registerError) throw overrides.registerError;
            return { deviceId: overrides.serverDeviceId ?? SERVER_ID,
                fingerprint: overrides.serverFingerprint ?? FINGERPRINT, state: 'active' };
        },
        async revokeDevice(input) {
            calls.push({ call: 'revokeServer', input });
            if (overrides.revokeError) throw overrides.revokeError;
            return { deviceId: input.deviceId, state: 'revoked' };
        },
        async readCurrentKeyEnvelope() {
            calls.push({ call: 'readEnvelope' });
            return overrides.envelopeResult
                ?? { readiness: 'pending_key', envelope: null };
        }
    };
    return { calls, lifecycle, api,
        newDeviceId: () => overrides.localDeviceId ?? LOCAL_ID,
        newIdempotencyKey: () => 'key-1' };
}

// ── the fingerprint, which exists to be read aloud ───────────────────────────

test('groups a fingerprint into readable blocks without altering it', () => {
    const formatted = formatFingerprint('abcdefgh1234');
    assert.equal(formatted, 'abcd efgh 1234');
    assert.equal(formatted.replace(/ /g, ''), 'abcdefgh1234');
});

test('refuses a fingerprint too short to be one', () => {
    assert.throws(() => formatFingerprint('abc'),
        error => error instanceof DeviceInitializationError && error.code === 'INVALID_FINGERPRINT');
});

test('never renders a fingerprint ungrouped', () => {
    const node = renderDeviceInitialization(doc, deviceInitializationModel({
        session: signedIn, status: 'registered',
        device: { deviceId: SERVER_ID, fingerprint: FINGERPRINT, state: 'active' }
    }));
    const shown = node.querySelector('.collab-device__fingerprint').textContent;
    assert.ok(shown.includes(' '), 'the fingerprint was rendered as one unbroken run');
    assert.equal(shown.replace(/ /g, ''), FINGERPRINT);
});

// ── the inherited readiness vocabulary ───────────────────────────────────────

test('carries exactly the five readiness values the server can report', () => {
    assert.deepEqual([...KEY_READINESS].sort(), [
        'key_ready', 'not_entitled', 'pending_key', 'revoked', 'stale_key'
    ]);
});

test('explains every readiness value in text', () => {
    for (const readiness of KEY_READINESS) {
        const presented = presentReadiness(readiness);
        assert.ok(presented.title.length > 5, readiness);
        assert.ok(presented.reason.length > 20, `${readiness} does not explain itself`);
    }
});

test('keeps stale_key distinct from pending_key', () => {
    const waiting = KEY_READINESS.filter(value => presentReadiness(value).waiting);
    assert.deepEqual(waiting.sort(), ['pending_key', 'stale_key']);
    const reasons = new Set(waiting.map(value => presentReadiness(value).reason));
    assert.equal(reasons.size, 2, 'two waiting states were given the same explanation');
});

test('both waiting states name who can unblock the user', () => {
    assert.match(presentReadiness('pending_key').reason, /owner or admin/);
    assert.match(presentReadiness('stale_key').reason, /owner or admin/);
    assert.doesNotMatch(presentReadiness('revoked').reason, /owner or admin/);
});

test('rejects a readiness value the server cannot report', () => {
    assert.throws(() => presentReadiness('almost_ready'),
        error => error.code === 'UNKNOWN_READINESS');
});

test('points a lost membership at the switcher, not an in-place retry', () => {
    assert.match(presentReadiness('not_entitled').reason, /switcher/);
    assert.equal(presentReadiness('not_entitled').blocked, true);
});

// ── the model ────────────────────────────────────────────────────────────────

test('waiting on a key is not rendered as a failure', () => {
    const model = deviceInitializationModel({
        session: signedIn, status: 'registered', readiness: 'pending_key',
        device: { deviceId: SERVER_ID, fingerprint: FINGERPRINT, state: 'active' }
    });
    assert.equal(model.waiting, true);
    assert.equal(model.failure, null);
});

test('an unsupported browser states both what is wrong and what to do', () => {
    const guidance = unsupportedGuidance(new Error('nope'));
    const model = deviceInitializationModel({
        session: signedIn, status: 'unsupported', guidance
    });
    assert.equal(model.supported, false);
    assert.match(model.blocked, /cannot protect a device key/);
    assert.match(model.blocked, /supported current browser/);
    assert.equal(model.canRegister, false);
});

test('asks an unknown session to wait rather than guessing signed out', () => {
    const model = deviceInitializationModel({ session: { authenticated: null } });
    assert.match(model.blocked, /Checking your session/);
});

test('asks a signed-out visitor to sign in', () => {
    const model = deviceInitializationModel({ session: { authenticated: false } });
    assert.match(model.blocked, /Sign in with GitHub/);
});

test('offers registration only when nothing is set up here yet', () => {
    assert.equal(deviceInitializationModel({ session: signedIn }).canRegister, true);
    assert.equal(deviceInitializationModel({
        session: signedIn, status: 'registered',
        device: { deviceId: SERVER_ID, fingerprint: FINGERPRINT, state: 'active' }
    }).canRegister, false);
});

test('offers revocation only for a device that is set up and active', () => {
    assert.equal(deviceInitializationModel({ session: signedIn }).canRevoke, false);
    assert.equal(deviceInitializationModel({
        session: signedIn, status: 'registered',
        device: { deviceId: SERVER_ID, fingerprint: FINGERPRINT, state: 'active' }
    }).canRevoke, true);
    assert.equal(deviceInitializationModel({
        session: signedIn, status: 'registered',
        device: { deviceId: SERVER_ID, fingerprint: FINGERPRINT, state: 'revoked' }
    }).canRevoke, false);
});

test('marks every in-flight status as busy', () => {
    for (const status of ['enrolling', 'registering', 'rebinding', 'revoking']) {
        assert.equal(deviceInitializationModel({ session: signedIn, status }).inFlight, true, status);
    }
});

test('rejects a status outside the closed set', () => {
    assert.throws(() => deviceInitializationModel({ session: signedIn, status: 'almost' }),
        error => error.code === 'INVALID_STATUS');
});

test('rejects a malformed device id', () => {
    assert.throws(() => deviceInitializationModel({
        session: signedIn, device: { deviceId: 'nope', fingerprint: FINGERPRINT, state: 'active' }
    }), error => error.code === 'INVALID_DEVICE');
});

test('exposes the contract action vocabulary unchanged', () => {
    assert.deepEqual([...DEVICE_ACTIONS],
        ['register-device', 'show-fingerprint', 'await-provisioning', 'revoke-device']);
    assert.equal(DEVICE_STATUSES.length, 9);
});

// ── the rendered surface ─────────────────────────────────────────────────────

test('marks the surface and exposes readiness as data, not colour', () => {
    const node = renderDeviceInitialization(doc, deviceInitializationModel({
        session: signedIn, status: 'registered', readiness: 'stale_key',
        device: { deviceId: SERVER_ID, fingerprint: FINGERPRINT, state: 'active' }
    }));
    assert.equal(node.getAttribute('data-collab-surface'), 'device-key-initialization');
    assert.equal(node.querySelector('[data-readiness]').getAttribute('data-readiness'), 'stale_key');
});

test('keeps both controls visible and explained when they cannot be used', () => {
    const node = renderDeviceInitialization(doc, deviceInitializationModel({
        session: { authenticated: false }
    }));
    for (const selector of ['.collab-device__register', '.collab-device__revoke']) {
        const control = node.querySelector(selector);
        assert.notEqual(control, null, `${selector} was hidden instead of explained`);
        assert.equal(control.disabled, true);
        assert.equal(control.getAttribute('aria-disabled'), 'true');
        assert.ok(control.getAttribute('title').length > 5, selector);
    }
});

test('announces a wait politely and marks it busy', () => {
    const node = renderDeviceInitialization(doc, deviceInitializationModel({
        session: signedIn, status: 'registered', readiness: 'pending_key',
        device: { deviceId: SERVER_ID, fingerprint: FINGERPRINT, state: 'active' }
    }));
    const readiness = node.querySelector('[data-readiness]');
    assert.equal(readiness.getAttribute('aria-live'), 'polite');
    assert.equal(readiness.getAttribute('aria-busy'), 'true');
});

test('builds every node through the document, never through innerHTML', () => {
    assert.equal(/\.innerHTML/.test(read('js/collaboration/device-initialization.js')), false);
});

// ── registration ─────────────────────────────────────────────────────────────

test('enrols before registering, because registration carries the public key', async () => {
    const stubs = harness();
    await runDeviceRegistration({ ...stubs, unlockSecret: new Uint8Array(8) });
    const order = stubs.calls.map(entry => entry.call);
    assert.deepEqual(order, ['changeContext', 'enroll', 'register', 'rebind']);
});

test('re-binds onto the id the server assigned, not the local one', async () => {
    const stubs = harness();
    const result = await runDeviceRegistration({ ...stubs, unlockSecret: new Uint8Array(8) });
    assert.equal(stubs.calls.find(entry => entry.call === 'enroll').deviceId, LOCAL_ID);
    assert.equal(stubs.calls.find(entry => entry.call === 'rebind').next, SERVER_ID);
    assert.equal(result.deviceId, SERVER_ID);
});

test('sends the frozen suite', async () => {
    const stubs = harness();
    await runDeviceRegistration({ ...stubs, unlockSecret: new Uint8Array(8) });
    assert.equal(stubs.calls.find(entry => entry.call === 'register').input.suite,
        'P256-HKDF-SHA256-A256GCM-v1');
    assert.equal(DEVICE_SUITE, 'P256-HKDF-SHA256-A256GCM-v1');
});

test('refuses to re-bind when the server stored a different fingerprint', async () => {
    const stubs = harness({ serverFingerprint: 'a-different-fingerprint-entirely' });
    await assert.rejects(runDeviceRegistration({ ...stubs, unlockSecret: new Uint8Array(8) }),
        error => error.code === 'FINGERPRINT_MISMATCH');
    assert.equal(stubs.calls.some(entry => entry.call === 'rebind'), false,
        'a key was bound to a device the server holds a different key for');
});

test('refuses a registration response without a usable device id', async () => {
    const stubs = harness({ serverDeviceId: 'not-a-uuid' });
    await assert.rejects(runDeviceRegistration({ ...stubs, unlockSecret: new Uint8Array(8) }),
        error => error.code === 'REGISTRATION_INCOMPLETE');
});

test('reports each step it reaches, in order', async () => {
    const stubs = harness();
    const seen = [];
    await runDeviceRegistration({ ...stubs, unlockSecret: new Uint8Array(8),
        onStep: status => seen.push(status) });
    assert.deepEqual(seen, ['enrolling', 'registering', 'rebinding', 'registered']);
});

test('requires each collaborator rather than reaching for a global', async () => {
    const stubs = harness();
    await assert.rejects(runDeviceRegistration({ api: stubs.api, newDeviceId: stubs.newDeviceId,
        newIdempotencyKey: stubs.newIdempotencyKey, unlockSecret: new Uint8Array(8) }),
    error => error.code === 'LIFECYCLE_REQUIRED');
    await assert.rejects(runDeviceRegistration({ lifecycle: stubs.lifecycle,
        newDeviceId: stubs.newDeviceId, newIdempotencyKey: stubs.newIdempotencyKey,
        unlockSecret: new Uint8Array(8) }), error => error.code === 'API_REQUIRED');
    await assert.rejects(runDeviceRegistration({ lifecycle: stubs.lifecycle, api: stubs.api,
        newIdempotencyKey: stubs.newIdempotencyKey, unlockSecret: new Uint8Array(8) }),
    error => error.code === 'DEVICE_ID_SOURCE_REQUIRED');
});

// ── readiness ────────────────────────────────────────────────────────────────

test('reads readiness from the service and presents it', async () => {
    const stubs = harness();
    const result = await readKeyReadiness({ api: stubs.api, workspaceId: WORKSPACE });
    assert.equal(result.readiness, 'pending_key');
    assert.equal(result.hasEnvelope, false);
    assert.match(result.presentation.reason, /provision/);
});

test('reports an envelope only when the device is actually key ready', async () => {
    const stubs = harness({ envelopeResult: { readiness: 'key_ready', envelope: { ciphertext: 'x' } } });
    const result = await readKeyReadiness({ api: stubs.api, workspaceId: WORKSPACE });
    assert.equal(result.hasEnvelope, true);
    assert.equal(result.presentation.waiting, false);
});

test('refuses a readiness value outside the frozen set', async () => {
    const stubs = harness({ envelopeResult: { readiness: 'nearly', envelope: null } });
    await assert.rejects(readKeyReadiness({ api: stubs.api, workspaceId: WORKSPACE }),
        error => error.code === 'UNKNOWN_READINESS');
});

// ── revocation ───────────────────────────────────────────────────────────────

test('revokes on the server before deleting the local key', async () => {
    const stubs = harness();
    await runDeviceRevocation({ lifecycle: stubs.lifecycle, api: stubs.api,
        deviceId: SERVER_ID, newIdempotencyKey: stubs.newIdempotencyKey });
    assert.deepEqual(stubs.calls.map(entry => entry.call), ['revokeServer', 'revokeLocal']);
});

test('keeps the local key when the server refuses the revocation', async () => {
    const error = new Error('denied');
    error.code = 'OPERATION_NOT_PERMITTED';
    const stubs = harness({ revokeError: error });
    await assert.rejects(runDeviceRevocation({ lifecycle: stubs.lifecycle, api: stubs.api,
        deviceId: SERVER_ID, newIdempotencyKey: stubs.newIdempotencyKey }));
    assert.equal(stubs.calls.some(entry => entry.call === 'revokeLocal'), false,
        'the only copy of the key was deleted while the server still trusts the device');
});
