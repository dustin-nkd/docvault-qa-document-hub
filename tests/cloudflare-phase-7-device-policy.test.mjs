// Drift tests for the CF-P7-005 gate. Each case mutates one thing and asserts
// the policy rejects it, so the gate is known to bite.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7Device, code } from '../scripts/cloudflare-phase-7-device-policy.mjs';
import { DEVICE_SUITE, KEY_READINESS, presentReadiness }
    from '../js/collaboration/device-initialization.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const input = () => ({
    manifest: json('config/cloudflare/phase-7-device-initialization.json'),
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    journeySource: read('js/collaboration/device-initialization.js'),
    lifecycleSource: read('js/collaboration/device-key-lifecycle.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    serverReadinessSource: read('functions/_lib/workspace-keys/workspace-key-service.ts'),
    browserTestSource: read('tests/browser-device-key-lifecycle.mjs'),
    unitTestSource: read('tests/collaboration-device-initialization.test.mjs'),
    journeyExports: {
        DEVICE_SUITE,
        KEY_READINESS: [...KEY_READINESS],
        presentReadiness
    }
});

test('the policy accepts the repository as it stands', () => {
    assert.equal(validatePhase7Device(input()), true);
});

// ── the ordering the two contracts force ─────────────────────────────────────

test('registering before a key exists is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace('    step(\'enrolling\');', '    const early = await api.registerDevice({});\n    step(\'enrolling\');');
    assert.throws(() => validatePhase7Device(drifted), /before a key exists/);
});

test('re-binding before the fingerprint is compared is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource
        .replace('    step(\'registering\');',
            '    await lifecycle.rebindDeviceId(\'x\', unlockSecret);\n    step(\'registering\');');
    assert.throws(() => validatePhase7Device(drifted), /re-bound before the returned fingerprint/);
});

test('dropping the fingerprint comparison entirely is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/FINGERPRINT_MISMATCH/g, 'IGNORED');
    assert.throws(() => validatePhase7Device(drifted), /lost one of its four ordered steps/);
});

test('claiming the rebind may mint new key material is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.registration.rebind_generates_no_new_key_material = false;
    assert.throws(() => validatePhase7Device(drifted), /orphaning the registered fingerprint/);
});

test('a rebind that generates a key pair is rejected', () => {
    const drifted = input();
    drifted.lifecycleSource = drifted.lifecycleSource.replace(
        'async rebindDeviceId(nextDeviceId, unlockSecret) {',
        'async rebindDeviceId(nextDeviceId, unlockSecret) {\n        const pair = await this.platformCrypto.subtle.generateKey({}, true, []);'
    );
    assert.throws(() => validatePhase7Device(drifted), /generates a key pair/);
});

test('deleting the original record before writing the replacement is rejected', () => {
    const drifted = input();
    drifted.lifecycleSource = drifted.lifecycleSource.replace(
        // `\s*` rather than `\n`: this source file is tracked with CRLF, and a
        // mutation that silently fails to apply would prove nothing.
        /await this\.store\.put\(this\.context\.userId, nextDeviceId, envelope\);\s*await this\.store\.delete\(this\.context\.userId, currentDeviceId\);/,
        'await this.store.delete(this.context.userId, currentDeviceId);\n            await this.store.put(this.context.userId, nextDeviceId, envelope);'
    );
    assert.notEqual(drifted.lifecycleSource, read('js/collaboration/device-key-lifecycle.js'),
        'the mutation did not apply, so this case would pass without testing anything');
    assert.throws(() => validatePhase7Device(drifted), /deletes the original record before/);
});

test('a suite the manifest does not declare is rejected', () => {
    const drifted = input();
    drifted.journeyExports.DEVICE_SUITE = 'P256-HKDF-SHA256-A256GCM-v2';
    assert.throws(() => validatePhase7Device(drifted), /suite the manifest does not declare/);
});

// ── the extension stays in the service ───────────────────────────────────────

test('the journey performing its own cryptography is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst pair = await crypto.subtle.generateKey({}, true, []);\n';
    assert.throws(() => validatePhase7Device(drifted), /performs cryptography itself/);
});

test('claiming a new cryptographic primitive is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.service_extension.new_cryptographic_primitive = true;
    assert.throws(() => validatePhase7Device(drifted), /Phase 7 may not add/);
});

test('dropping a browser from the rebind matrix is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.service_extension.browser_matrix_qualified = ['chromium'];
    assert.throws(() => validatePhase7Device(drifted), /required browser matrix/);
});

test('a browser suite that stops proving the fingerprint survives is rejected', () => {
    const drifted = input();
    drifted.browserTestSource = drifted.browserTestSource.replace(/fingerprintUnchanged/g, 'x');
    assert.throws(() => validatePhase7Device(drifted), /keeps the fingerprint/);
});

test('a browser suite that stops proving the old record is gone is rejected', () => {
    const drifted = input();
    drifted.browserTestSource = drifted.browserTestSource.replace(/originalRecordRemoved/g, 'x');
    assert.throws(() => validatePhase7Device(drifted), /abandoned record is removed/);
});

// ── the inherited readiness vocabulary ───────────────────────────────────────

test('extending the inherited readiness vocabulary is rejected', () => {
    const drifted = input();
    drifted.journeyExports.KEY_READINESS.push('almost_ready');
    assert.throws(() => validatePhase7Device(drifted), /readiness set other than the frozen one/);
});

test('a rendered value the server cannot report is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.readiness.values = [...KEY_READINESS, 'rotating'];
    drifted.journeyExports.KEY_READINESS = [...KEY_READINESS, 'rotating'];
    assert.throws(() => validatePhase7Device(drifted), /drifted from WorkspaceKeyReadiness/);
});

test('giving two waiting states the same explanation is rejected', () => {
    const drifted = input();
    drifted.journeyExports.presentReadiness = () => ({ reason: 'Waiting.', waiting: true });
    assert.throws(() => validatePhase7Device(drifted), /share one explanation/);
});

test('claiming waiting is an error is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.readiness.waiting_is_not_an_error = false;
    assert.throws(() => validatePhase7Device(drifted), /readiness claim drifted/);
});

test('removing a readiness shape leaves colour alone and is rejected', () => {
    const drifted = input();
    drifted.styleSource = drifted.styleSource.replace(/collab-device__shape--stale_key/g, 'x');
    assert.throws(() => validatePhase7Device(drifted), /stale_key has no shape/);
});

// ── the fingerprint and revocation ───────────────────────────────────────────

test('rendering the fingerprint ungrouped is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/formatFingerprint/g, 'raw');
    assert.throws(() => validatePhase7Device(drifted), /no longer grouped/);
});

test('deleting the local key before the server revokes is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(
        // `\s*` rather than `\n`: git renormalises tracked sources to CRLF on
        // checkout, and a mutation that silently fails to apply proves nothing.
        /step\('revoking'\);\s*await api\.revokeDevice\(\{ deviceId, idempotencyKey: newIdempotencyKey\(\) \}\);\s*await lifecycle\.revokeLocalDevice\(\);/,
        'step(\'revoking\');\n    await lifecycle.revokeLocalDevice();\n    await api.revokeDevice({ deviceId, idempotencyKey: newIdempotencyKey() });'
    );
    assert.notEqual(drifted.journeySource, read('js/collaboration/device-initialization.js'),
        'the mutation did not apply, so this case would pass without testing anything');
    assert.throws(() => validatePhase7Device(drifted), /local key is deleted before/);
});

test('claiming a refused revocation may still drop the local key is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.revocation.local_key_survives_a_refused_revocation = false;
    assert.throws(() => validatePhase7Device(drifted), /revocation claim drifted/);
});

// ── preconditions and isolation ──────────────────────────────────────────────

test('hiding a control the user cannot use is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.preconditions.blocked_control_hidden = true;
    assert.throws(() => validatePhase7Device(drifted), /hidden instead of explained/);
});

test('restating the unsupported-browser guidance instead of delegating is rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/unsupportedBrowserGuidance/g, 'ownGuidance');
    assert.throws(() => validatePhase7Device(drifted), /restated instead of delegated/);
});

test('minting identifiers inside the journey is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst id = crypto.randomUUID();\n';
    assert.throws(() => validatePhase7Device(drifted), /mints identifiers/);
});

test('reaching for a personal vault key is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst docs = storage.getItem("docvault_docs");\n';
    assert.throws(() => validatePhase7Device(drifted), /reached for docvault_docs/);
});

test('rendering through innerHTML is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nroot.innerHTML = model.fingerprint;\n';
    assert.throws(() => validatePhase7Device(drifted), /innerHTML/);
});

test('performing transport inside the journey is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst response = fetch("/api/v1/devices");\n';
    assert.throws(() => validatePhase7Device(drifted), /own transport/);
});

test('an eager collaboration script tag is rejected', () => {
    const drifted = input();
    drifted.indexHtml += '<script type="module" src="js/collaboration/device-initialization.js"></script>';
    assert.throws(() => validatePhase7Device(drifted), /eager script tag/);
});

// ── gate bookkeeping ─────────────────────────────────────────────────────────

test('a manifest that authorizes the wrong next story is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authorizes_on_approval = 'CF-P7-008';
    assert.throws(() => validatePhase7Device(drifted), /Unsupported Phase 7/);
});

test('a unit test inventory that disagrees with the suite is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.tests.unit_count += 1;
    assert.throws(() => validatePhase7Device(drifted), /Unit test inventory drifted/);
});

test('documenting a prohibition passes; performing it fails', () => {
    const documented = input();
    documented.journeySource += '\n// this journey never calls fetch( directly\n';
    assert.equal(validatePhase7Device(documented), true);
    assert.equal(code('const a = 1; // fetch(x)').includes('fetch(x)'), false);
});
