// CF-P7-004 — the create workspace journey.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    CREATE_WORKSPACE_STEPS, CREATE_WORKSPACE_STATUSES, CREATE_WORKSPACE_CODES,
    PRESENTATION_BY_CODE, NAME_RULE, CreateWorkspaceError,
    validateDisplayName, presentFailure, createWorkspaceModel, renderCreateWorkspace,
    runCreateWorkspace
} from '../js/collaboration/create-workspace.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const DEVICE = '44444444-4444-4444-8444-444444444444';
const WORKSPACE = '55555555-5555-4555-8555-555555555555';
const OTHER_WORKSPACE = '66666666-6666-4666-8666-666666666666';
const OTHER_DEVICE = '77777777-7777-4777-8777-777777777777';

const signedIn = { authenticated: true };
const activeDevice = { deviceId: DEVICE, status: 'active' };

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

// ── journey doubles ──────────────────────────────────────────────────────────

function stubs(overrides = {}) {
    const calls = [];
    const binding = {
        workspaceId: WORKSPACE,
        initialKeyVersion: 1,
        ownerDeviceId: DEVICE,
        ownerFingerprint: 'SHA256:abc',
        ...overrides.binding
    };
    const written = [];
    let minted = 0;
    return {
        calls,
        written,
        mintedCount: () => minted,
        api: {
            async createBootstrapIntent(input) {
                calls.push({ call: 'intent', input });
                if (overrides.intentError) throw overrides.intentError;
                return binding;
            },
            async createWorkspace(input) {
                calls.push({ call: 'create', input });
                if (overrides.createError) throw overrides.createError;
                return { workspaceId: overrides.createdWorkspaceId ?? WORKSPACE };
            }
        },
        keys: {
            async sealCreatorEnvelope(input) {
                calls.push({ call: 'seal', input });
                return { envelope: { sealed: true, for: input.workspaceId } };
            }
        },
        selection: { write(workspaceId) { written.push(workspaceId); return true; } },
        newIdempotencyKey() { minted += 1; return `key-${minted}`; }
    };
}

// ── the name rule, mirrored from the server ──────────────────────────────────

test('accepts an ordinary workspace name', () => {
    assert.equal(validateDisplayName('Platform QA').valid, true);
});

test('rejects an empty name with a reason a person can act on', () => {
    const result = validateDisplayName('');
    assert.equal(result.reason, 'required');
    assert.match(result.message, /Enter a name/);
});

test('treats a whitespace-only name as missing rather than untrimmed', () => {
    assert.equal(validateDisplayName('   ').reason, 'required');
});

test('rejects a name with leading or trailing space, as the server does', () => {
    assert.equal(validateDisplayName(' Platform QA').reason, 'untrimmed');
    assert.equal(validateDisplayName('Platform QA ').reason, 'untrimmed');
});

test('rejects a name carrying a control character', () => {
    assert.equal(validateDisplayName('Platform\u0007QA').reason, 'control-character');
    assert.equal(validateDisplayName('Platform\u007fQA').reason, 'control-character');
});

test('counts code points, so 80 astral characters are accepted', () => {
    const name = '\u{1F600}'.repeat(NAME_RULE.maxCodePoints);
    assert.equal([...name].length, 80);
    assert.equal(name.length, 160, 'the UTF-16 length is double, which is the trap');
    assert.equal(validateDisplayName(name).valid, true);
});

test('rejects one code point past the server bound', () => {
    const name = 'a'.repeat(NAME_RULE.maxCodePoints + 1);
    assert.equal(validateDisplayName(name).reason, 'too-long');
});

// ── the error taxonomy ───────────────────────────────────────────────────────

test('presents every reachable code with an explanation', () => {
    for (const code of CREATE_WORKSPACE_CODES) {
        const presented = presentFailure(code);
        assert.equal(presented.expected, true, code);
        assert.equal(presented.presentation, PRESENTATION_BY_CODE[code], code);
        assert.ok(presented.reason.length > 10, `${code} does not explain itself`);
    }
});

test('reports an unexpected code instead of flattening it into error', () => {
    const presented = presentFailure('SOMETHING_NEW');
    assert.equal(presented.expected, false);
    assert.equal(presented.code, 'SOMETHING_NEW');
    assert.match(presented.reason, /cannot happen to produce/);
});

test('keeps the two codes this journey cannot produce out of the reachable set', () => {
    assert.equal(CREATE_WORKSPACE_CODES.includes('DOCUMENT_REVISION_CONFLICT'), false);
    assert.equal(CREATE_WORKSPACE_CODES.includes('RESOURCE_NOT_FOUND'), false);
    assert.equal(Object.keys(PRESENTATION_BY_CODE).length, 12);
});

test('handles a thrown value with no code at all', () => {
    const presented = presentFailure(undefined);
    assert.equal(presented.code, 'UNKNOWN');
    assert.equal(presented.presentation, 'error');
});

// ── the model ────────────────────────────────────────────────────────────────

test('blocks with a stated reason when there is no active device', () => {
    const model = createWorkspaceModel({ session: signedIn, device: null, name: 'Platform QA' });
    assert.equal(model.canSubmit, false);
    assert.match(model.blocked, /Set up this device/);
});

test('treats a registered but inactive device as not ready', () => {
    const model = createWorkspaceModel({
        session: signedIn, device: { deviceId: DEVICE, status: 'revoked' }, name: 'Platform QA'
    });
    assert.equal(model.deviceReady, false);
    assert.equal(model.canSubmit, false);
});

test('asks a signed-out visitor to sign in', () => {
    const model = createWorkspaceModel({
        session: { authenticated: false }, device: null, name: 'Platform QA'
    });
    assert.match(model.blocked, /Sign in with GitHub/);
});

test('renders an unknown session as checking, never as signed out', () => {
    const model = createWorkspaceModel({
        session: { authenticated: null }, device: activeDevice, name: 'Platform QA'
    });
    assert.match(model.blocked, /Checking your session/);
    assert.equal(model.authenticated, false);
});

test('permits submission only when every precondition already holds', () => {
    const model = createWorkspaceModel({
        session: signedIn, device: activeDevice, name: 'Platform QA'
    });
    assert.equal(model.canSubmit, true);
    assert.equal(model.blocked, null);
});

test('refuses to submit while a call is in flight', () => {
    for (const status of ['binding', 'sealing', 'creating']) {
        const model = createWorkspaceModel({
            session: signedIn, device: activeDevice, name: 'Platform QA', status
        });
        assert.equal(model.canSubmit, false, status);
        assert.equal(model.inFlight, true, status);
    }
});

test('rejects a malformed device id rather than sending it', () => {
    assert.throws(() => createWorkspaceModel({
        session: signedIn, device: { deviceId: 'not-a-uuid', status: 'active' }, name: 'x'
    }), error => error instanceof CreateWorkspaceError && error.code === 'INVALID_DEVICE');
});

test('rejects a status outside the closed set', () => {
    assert.throws(() => createWorkspaceModel({
        session: signedIn, device: activeDevice, status: 'almost-done'
    }), error => error.code === 'INVALID_STATUS');
});

test('advances the three steps as the status moves', () => {
    const stateAt = status => createWorkspaceModel({
        session: signedIn, device: activeDevice, name: 'Platform QA', status
    }).steps.map(item => item.state);
    assert.deepEqual(stateAt('naming'), ['active', 'pending', 'pending']);
    assert.deepEqual(stateAt('binding'), ['done', 'active', 'pending']);
    assert.deepEqual(stateAt('sealing'), ['done', 'active', 'pending']);
    assert.deepEqual(stateAt('creating'), ['done', 'done', 'active']);
    assert.deepEqual(stateAt('created'), ['done', 'done', 'done']);
});

test('marks every step stopped when the journey failed', () => {
    const model = createWorkspaceModel({
        session: signedIn, device: activeDevice, name: 'Platform QA', status: 'failed',
        failure: presentFailure('RATE_LIMITED')
    });
    assert.deepEqual(model.steps.map(item => item.state), ['stopped', 'stopped', 'stopped']);
    assert.equal(model.failure.code, 'RATE_LIMITED');
});

test('exposes the contract step and status vocabularies unchanged', () => {
    assert.deepEqual([...CREATE_WORKSPACE_STEPS], ['name-workspace', 'bootstrap-key', 'create']);
    assert.equal(CREATE_WORKSPACE_STATUSES.length, 6);
});

// ── the rendered surface ─────────────────────────────────────────────────────

test('marks the surface and its status as data, not colour', () => {
    const node = renderCreateWorkspace(doc, createWorkspaceModel({
        session: signedIn, device: activeDevice, name: 'Platform QA'
    }));
    assert.equal(node.getAttribute('data-collab-surface'), 'create-workspace');
    assert.equal(node.getAttribute('data-create-status'), 'naming');
    const shapes = node.querySelectorAll('[data-step-state]');
    assert.equal(shapes.length, 3);
});

test('keeps a blocked submit visible, disabled, and explained', () => {
    const node = renderCreateWorkspace(doc, createWorkspaceModel({
        session: signedIn, device: null, name: 'Platform QA'
    }));
    const submit = node.querySelector('.collab-create__submit');
    assert.notEqual(submit, null, 'the control was hidden instead of explained');
    assert.equal(submit.disabled, true);
    assert.equal(submit.getAttribute('aria-disabled'), 'true');
    assert.match(submit.getAttribute('title'), /Set up this device/);
    assert.match(node.querySelector('.collab-create__blocked').textContent, /Set up this device/);
});

test('offers the device journey to someone blocked on a device', () => {
    const node = renderCreateWorkspace(doc, createWorkspaceModel({
        session: signedIn, device: null, name: 'Platform QA'
    }));
    assert.notEqual(node.querySelector('[data-collab-action="device-setup-open"]'), null);
});

test('does not offer the device journey to someone who is signed out', () => {
    const node = renderCreateWorkspace(doc, createWorkspaceModel({
        session: { authenticated: false }, device: null, name: ''
    }));
    assert.equal(node.querySelector('[data-collab-action="device-setup-open"]'), null);
});

test('marks an invalid name invalid and says why', () => {
    const node = renderCreateWorkspace(doc, createWorkspaceModel({
        session: signedIn, device: activeDevice, name: ' Platform QA'
    }));
    assert.equal(node.querySelector('.collab-create__input').getAttribute('aria-invalid'), 'true');
    assert.match(node.querySelector('.collab-create__hint').textContent, /Remove the spaces/);
});

test('announces progress politely and marks work as busy', () => {
    const node = renderCreateWorkspace(doc, createWorkspaceModel({
        session: signedIn, device: activeDevice, name: 'Platform QA', status: 'creating'
    }));
    const status = node.querySelector('.collab-create__status');
    assert.equal(status.getAttribute('aria-live'), 'polite');
    assert.equal(status.getAttribute('aria-busy'), 'true');
});

test('renders a failure with its code and its presentation', () => {
    const node = renderCreateWorkspace(doc, createWorkspaceModel({
        session: signedIn, device: activeDevice, name: 'Platform QA', status: 'failed',
        failure: presentFailure('OPERATION_NOT_PERMITTED')
    }));
    const failure = node.querySelector('.collab-create__failure');
    assert.equal(failure.getAttribute('data-failure-code'), 'OPERATION_NOT_PERMITTED');
    assert.equal(failure.getAttribute('data-failure-presentation'), 'role-disabled-explanation');
    assert.equal(failure.getAttribute('role'), 'alert');
});

test('builds every node through the document, never through innerHTML', () => {
    assert.equal(/\.innerHTML/.test(read('js/collaboration/create-workspace.js')), false);
});

// ── the journey ──────────────────────────────────────────────────────────────

test('seals the creator envelope only after the binding arrives', async () => {
    const harness = stubs();
    await runCreateWorkspace({
        api: harness.api, keys: harness.keys, selection: harness.selection,
        newIdempotencyKey: harness.newIdempotencyKey,
        displayName: 'Platform QA', ownerDeviceId: DEVICE
    });
    assert.deepEqual(harness.calls.map(entry => entry.call), ['intent', 'seal', 'create']);
    const seal = harness.calls.find(entry => entry.call === 'seal');
    assert.equal(seal.input.workspaceId, WORKSPACE, 'sealed against the server binding');
    assert.equal(seal.input.keyVersion, 1);
});

test('sends one idempotency key for both calls', async () => {
    const harness = stubs();
    const result = await runCreateWorkspace({
        api: harness.api, keys: harness.keys, selection: harness.selection,
        newIdempotencyKey: harness.newIdempotencyKey,
        displayName: 'Platform QA', ownerDeviceId: DEVICE
    });
    const sent = harness.calls.filter(entry => entry.call !== 'seal')
        .map(entry => entry.input.idempotencyKey);
    assert.deepEqual(sent, ['key-1', 'key-1']);
    assert.equal(harness.mintedCount(), 1);
    assert.equal(result.idempotencyKey, 'key-1');
});

test('a resumed attempt reuses the original key instead of minting a second', async () => {
    const harness = stubs();
    await runCreateWorkspace({
        api: harness.api, keys: harness.keys, selection: harness.selection,
        newIdempotencyKey: harness.newIdempotencyKey,
        displayName: 'Platform QA', ownerDeviceId: DEVICE, idempotencyKey: 'original-key'
    });
    assert.equal(harness.mintedCount(), 0);
    const sent = harness.calls.filter(entry => entry.call !== 'seal')
        .map(entry => entry.input.idempotencyKey);
    assert.deepEqual(sent, ['original-key', 'original-key']);
});

test('refuses a binding bound to a different device', async () => {
    const harness = stubs({ binding: { ownerDeviceId: OTHER_DEVICE } });
    await assert.rejects(runCreateWorkspace({
        api: harness.api, keys: harness.keys, selection: harness.selection,
        newIdempotencyKey: harness.newIdempotencyKey,
        displayName: 'Platform QA', ownerDeviceId: DEVICE
    }), error => error.code === 'BINDING_DEVICE_MISMATCH');
    assert.equal(harness.calls.some(entry => entry.call === 'seal'), false);
});

test('refuses a created id that is not the one it sealed against', async () => {
    const harness = stubs({ createdWorkspaceId: OTHER_WORKSPACE });
    await assert.rejects(runCreateWorkspace({
        api: harness.api, keys: harness.keys, selection: harness.selection,
        newIdempotencyKey: harness.newIdempotencyKey,
        displayName: 'Platform QA', ownerDeviceId: DEVICE
    }), error => error.code === 'WORKSPACE_ID_MISMATCH');
    assert.deepEqual(harness.written, [], 'a mismatched workspace never becomes the selection');
});

test('makes the new workspace the active selection on success', async () => {
    const harness = stubs();
    const result = await runCreateWorkspace({
        api: harness.api, keys: harness.keys, selection: harness.selection,
        newIdempotencyKey: harness.newIdempotencyKey,
        displayName: 'Platform QA', ownerDeviceId: DEVICE
    });
    assert.equal(result.status, 'created');
    assert.deepEqual(harness.written, [WORKSPACE]);
});

test('reports a server code as a stated failure and creates nothing', async () => {
    const error = new Error('denied');
    error.code = 'RATE_LIMITED';
    const harness = stubs({ intentError: error });
    const result = await runCreateWorkspace({
        api: harness.api, keys: harness.keys, selection: harness.selection,
        newIdempotencyKey: harness.newIdempotencyKey,
        displayName: 'Platform QA', ownerDeviceId: DEVICE
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.code, 'RATE_LIMITED');
    assert.equal(result.workspaceId, null);
    assert.deepEqual(harness.written, []);
});

test('hands back the key a failed attempt used, so a retry can resume it', async () => {
    const error = new Error('unavailable');
    error.code = 'COLLABORATION_UNAVAILABLE';
    const harness = stubs({ createError: error });
    const result = await runCreateWorkspace({
        api: harness.api, keys: harness.keys, selection: harness.selection,
        newIdempotencyKey: harness.newIdempotencyKey,
        displayName: 'Platform QA', ownerDeviceId: DEVICE
    });
    assert.equal(result.idempotencyKey, 'key-1');
    assert.equal(result.failure.presentation, 'error');
});

test('reports each step it reaches, in order', async () => {
    const harness = stubs();
    const seen = [];
    await runCreateWorkspace({
        api: harness.api, keys: harness.keys, selection: harness.selection,
        newIdempotencyKey: harness.newIdempotencyKey,
        displayName: 'Platform QA', ownerDeviceId: DEVICE, onStep: status => seen.push(status)
    });
    assert.deepEqual(seen, ['binding', 'sealing', 'creating', 'created']);
});

test('will not start with a name the server would reject', async () => {
    const harness = stubs();
    await assert.rejects(runCreateWorkspace({
        api: harness.api, keys: harness.keys, selection: harness.selection,
        newIdempotencyKey: harness.newIdempotencyKey,
        displayName: ' untrimmed ', ownerDeviceId: DEVICE
    }), error => error.code === 'INVALID_NAME');
    assert.deepEqual(harness.calls, [], 'nothing was sent');
});

test('requires each collaborator rather than reaching for a global', async () => {
    const harness = stubs();
    await assert.rejects(runCreateWorkspace({
        keys: harness.keys, selection: harness.selection,
        newIdempotencyKey: harness.newIdempotencyKey,
        displayName: 'Platform QA', ownerDeviceId: DEVICE
    }), error => error.code === 'API_REQUIRED');
    await assert.rejects(runCreateWorkspace({
        api: harness.api, selection: harness.selection,
        newIdempotencyKey: harness.newIdempotencyKey,
        displayName: 'Platform QA', ownerDeviceId: DEVICE
    }), error => error.code === 'KEYS_REQUIRED');
    await assert.rejects(runCreateWorkspace({
        api: harness.api, keys: harness.keys,
        newIdempotencyKey: harness.newIdempotencyKey,
        displayName: 'Platform QA', ownerDeviceId: DEVICE
    }), error => error.code === 'SELECTION_REQUIRED');
});
