// Drift tests for the CF-P7-003 gate. Each case mutates one thing and asserts
// the policy rejects it, so the gate is known to bite.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7Account, code } from '../scripts/cloudflare-phase-7-account-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const input = () => ({
    manifest: json('config/cloudflare/phase-7-account-workspace.json'),
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    contextSource: read('js/collaboration/workspace-context.js'),
    accountSource: read('js/collaboration/account-menu.js'),
    switcherSource: read('js/collaboration/workspace-switcher.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    unitTestSource: read('tests/collaboration-account-workspace.test.mjs')
});

test('the policy accepts the repository as it stands', () => {
    assert.equal(validatePhase7Account(input()), true);
});

// ── the comment-versus-code distinction ──────────────────────────────────────

test('comment stripping removes comments and keeps code', () => {
    assert.equal(code('const a = 1; // workspaces[0]').includes('workspaces[0]'), false);
    assert.equal(code('/* workspaces[0] */ const a = 1;').includes('workspaces[0]'), false);
    assert.equal(code('const a = workspaces[0];').includes('workspaces[0]'), true);
    // A URL must not be mistaken for a line comment.
    assert.equal(code("const u = 'https://x.test/a';").includes('https://x.test/a'), true);
});

test('documenting a prohibition passes; performing it fails', () => {
    const documented = input();
    documented.contextSource += '\n// never fall back to workspaces[0]\n';
    assert.equal(validatePhase7Account(documented), true);

    const performed = input();
    performed.contextSource += '\nconst chosen = workspaces[0];\n';
    assert.throws(() => validatePhase7Account(performed), /first-workspace fallback/);
});

// ── U2 drift ─────────────────────────────────────────────────────────────────

test('permitting a silent fallback is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.workspace_identity.silent_fallback_on_unavailable = true;
    assert.throws(() => validatePhase7Account(drifted), /silent fallback/);
});

test('moving the indicator inside the menu is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.workspace_identity.indicator_outside_menu = false;
    assert.throws(() => validatePhase7Account(drifted), /no longer holds without opening it/);
});

test('losing the independent context renderer is rejected', () => {
    const drifted = input();
    drifted.switcherSource = drifted.switcherSource
        .replace('export function renderContextIndicator', 'function renderContextIndicator');
    assert.throws(() => validatePhase7Account(drifted), /independently renderable/);
});

test('dropping a context status is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.workspace_identity.statuses =
        drifted.manifest.workspace_identity.statuses.filter(item => item !== 'unavailable');
    assert.throws(() => validatePhase7Account(drifted), /status set drifted/);
});

test('losing the visual distinction for a non-active context is rejected', () => {
    const drifted = input();
    drifted.styleSource = drifted.styleSource
        .replace(/\.collab-context:not\(\.collab-context--active\)/g, '.x-removed');
    assert.throws(() => validatePhase7Account(drifted), /no longer visually distinguished/);
});

// ── account menu drift ───────────────────────────────────────────────────────

test('allowing a non-https avatar is rejected', () => {
    const drifted = input();
    drifted.accountSource = drifted.accountSource.replace(/startsWith\('https:\/\/'\)/g, 'length > 0');
    assert.throws(() => validatePhase7Account(drifted), /restricted to https/);
});

test('dropping the login requirement is rejected', () => {
    const drifted = input();
    drifted.accountSource = drifted.accountSource.replace(/LOGIN_REQUIRED/g, 'SOMETHING_ELSE');
    assert.throws(() => validatePhase7Account(drifted), /requires a login/);
});

// ── keyboard and role drift ──────────────────────────────────────────────────

test('losing focus restoration is rejected', () => {
    const drifted = input();
    drifted.switcherSource = drifted.switcherSource.replace(/trigger\.focus\(\)/g, 'void 0');
    assert.throws(() => validatePhase7Account(drifted), /restores focus/);
});

test('permitting a hidden disabled control is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.role_presentation.disabled_control_hidden = true;
    assert.throws(() => validatePhase7Account(drifted), /hidden instead of explained/);
});

test('accepting an unknown role is rejected', () => {
    const drifted = input();
    drifted.switcherSource = drifted.switcherSource.replace(/INVALID_ROLE/g, 'OK');
    assert.throws(() => validatePhase7Account(drifted), /unknown role/);
});

test('losing a role badge style hook is rejected', () => {
    const drifted = input();
    drifted.styleSource = drifted.styleSource.replace(/collab-role-badge--owner/g, 'x-gone');
    assert.throws(() => validatePhase7Account(drifted), /owner badge/);
});

// ── isolation drift ──────────────────────────────────────────────────────────

test('reaching for personal storage is rejected', () => {
    const drifted = input();
    // Appended to the account module: the context module is additionally guarded
    // by the selection-key namespace assertion, which would fire first and hide
    // which check actually caught it.
    drifted.accountSource += "\nstorage.getItem('docvault_docs');";
    assert.throws(() => validatePhase7Account(drifted), /reached for docvault_docs/);
});

test('an eager collaboration script tag is rejected', () => {
    const drifted = input();
    drifted.indexHtml += '\n<script src="js/collaboration/account-menu.js"></script>';
    assert.throws(() => validatePhase7Account(drifted), /eager script tag/);
});

test('a drifted unit test count is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.tests.unit_count -= 1;
    assert.throws(() => validatePhase7Account(drifted), /Unit test inventory drifted/);
});

test('a surface owned by another story is rejected', () => {
    const drifted = input();
    drifted.contract = clone(drifted.contract);
    drifted.contract.surfaces.find(item => item.id === 'account-menu').owner = 'CF-P7-006';
    assert.throws(() => validatePhase7Account(drifted), /not owned by CF-P7-003/);
});
