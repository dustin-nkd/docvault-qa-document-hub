// Drift tests for the CF-P7-012 gate. Each case mutates one thing and asserts
// the policy rejects it, so the gate is known to bite.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7Qualification, REQUIRED_SURFACES }
    from '../scripts/cloudflare-phase-7-qualification-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const input = () => ({
    manifest: json('config/cloudflare/phase-7-qualification.json'),
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    harnessSource: read('tests/browser-collaboration-qualification.mjs'),
    result: json('config/cloudflare/phase-7-qualification-result.json'),
    packageJson: json('package.json')
});

test('the policy accepts the repository as it stands', () => {
    assert.equal(validatePhase7Qualification(input()), true);
});

// ── coverage ─────────────────────────────────────────────────────────────────

test('dropping a surface from the qualification is rejected', () => {
    for (const surface of REQUIRED_SURFACES) {
        const drifted = input();
        drifted.manifest = clone(drifted.manifest);
        drifted.manifest.surfaces_qualified = REQUIRED_SURFACES
            .filter(item => item !== surface);
        assert.throws(() => validatePhase7Qualification(drifted),
            /missing from the qualification/, surface);
    }
});

test('a harness that stops rendering a surface is rejected', () => {
    const drifted = input();
    drifted.harnessSource = drifted.harnessSource.replace(/'conflict-dialog'/g, "'something'");
    assert.throws(() => validatePhase7Qualification(drifted),
        /does not render conflict-dialog/);
});

// ── U5 and U6 ────────────────────────────────────────────────────────────────

test('a non-zero finding is rejected', () => {
    for (const key of ['horizontal_page_scroll', 'overflowing_controls', 'clipped_text_nodes',
        'targets_under_24px', 'controls_without_visible_focus_ring',
        'disabled_controls_without_announced_reason', 'disabled_control_reached_by_tab']) {
        const drifted = input();
        drifted.manifest = clone(drifted.manifest);
        drifted.manifest.gate_ux[key] = 1;
        assert.throws(() => validatePhase7Qualification(drifted),
            new RegExp(`not zero: ${key}`), key);
    }
});

test('dropping a width, theme, or browser is rejected', () => {
    const widths = input();
    widths.manifest = clone(widths.manifest);
    widths.manifest.gate_ux.widths_px = [320, 768];
    assert.throws(() => validatePhase7Qualification(widths), /widths drifted/);

    const themes = input();
    themes.manifest = clone(themes.manifest);
    themes.manifest.gate_ux.themes = ['dark'];
    assert.throws(() => validatePhase7Qualification(themes), /theme was dropped/);

    const browsers = input();
    browsers.manifest = clone(browsers.manifest);
    browsers.manifest.gate_ux.browsers = ['chromium'];
    assert.throws(() => validatePhase7Qualification(browsers), /browser was dropped/);
});

test('dropping the long-name case is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.gate_ux.long_name_used = false;
    assert.throws(() => validatePhase7Qualification(drifted), /truncation is no longer exercised/);
});

test('a focus contrast below the frozen floor is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.gate_ux.lowest_focus_ring_contrast = 2.5;
    assert.throws(() => validatePhase7Qualification(drifted), /below the 3:1 floor/);
});

test('a floor that drifts from the frozen baseline is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.gate_ux.focus_ring_contrast_floor = 1;
    assert.throws(() => validatePhase7Qualification(drifted), /floor drifted/);
});

// ── the recorded result must back the claim ──────────────────────────────────

test('a result missing a browser is rejected', () => {
    const drifted = input();
    drifted.result = clone(drifted.result);
    drifted.result.summary = drifted.result.summary.filter(entry => entry.browser !== 'webkit');
    assert.throws(() => validatePhase7Qualification(drifted), /does not cover the required browsers/);
});

test('a result recording fewer measurements is rejected', () => {
    const drifted = input();
    drifted.result = clone(drifted.result);
    drifted.result.summary[0].widths = 3;
    assert.throws(() => validatePhase7Qualification(drifted), /three widths in two themes/);
});

test('a result where nothing was measured is rejected', () => {
    const drifted = input();
    drifted.result = clone(drifted.result);
    drifted.result.summary[0].focusable = 0;
    assert.throws(() => validatePhase7Qualification(drifted), /nothing was actually measured/);
});

test('a result whose contrast contradicts the claim is rejected', () => {
    const drifted = input();
    drifted.result = clone(drifted.result);
    drifted.result.summary[1].lowestRingContrast = 1.2;
    assert.throws(() => validatePhase7Qualification(drifted), /below the floor/);
});

// ── declared limits ──────────────────────────────────────────────────────────

test('a browser that is neither asserted nor declared undriven is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.declared_limits.tab_traversal_not_driven_in = [];
    assert.throws(() => validatePhase7Qualification(drifted), /silent gap/);
});

test('dropping the reason for narrowing is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.declared_limits.reason = 'because';
    assert.throws(() => validatePhase7Qualification(drifted), /reason traversal is narrowed/);
});

test('an undeclared measurement exclusion is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.declared_limits.clipped_text_excludes_form_fields = false;
    assert.throws(() => validatePhase7Qualification(drifted), /no longer declared/);
});

test('an exclusion with no stated reason is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.declared_limits.focus_audit_exclusion_reason = 'n/a';
    assert.throws(() => validatePhase7Qualification(drifted), /focus-audit exclusion has no stated reason/);
});

test('a harness that stops logging its narrowing at run time is rejected', () => {
    const drifted = input();
    drifted.harnessSource = drifted.harnessSource.replace(/traversal not driven/g, 'ok');
    assert.throws(() => validatePhase7Qualification(drifted), /at run time/);
});

// ── findings and wiring ──────────────────────────────────────────────────────

test('a qualification that records no findings is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.defects_found_and_fixed = [];
    assert.throws(() => validatePhase7Qualification(drifted), /records no findings/);
});

test('a finding without a cause or fix is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    delete drifted.manifest.defects_found_and_fixed[0].cause;
    assert.throws(() => validatePhase7Qualification(drifted), /missing its cause/);
});

test('a harness not wired into the release browser suite is rejected', () => {
    const drifted = input();
    drifted.packageJson = clone(drifted.packageJson);
    drifted.packageJson.scripts['test:e2e'] = 'node tests/browser-smoke.mjs';
    assert.throws(() => validatePhase7Qualification(drifted), /release browser suite/);
});

test('a harness whose npm script points elsewhere is rejected', () => {
    const drifted = input();
    drifted.packageJson = clone(drifted.packageJson);
    drifted.packageJson.scripts['test:collab:qualify:e2e'] = 'node tests/other.mjs';
    assert.throws(() => validatePhase7Qualification(drifted), /not wired to its npm script/);
});

test('a manifest that authorizes the wrong next story is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authorizes_on_approval = 'CF-P7-014';
    assert.throws(() => validatePhase7Qualification(drifted), /Unsupported Phase 7/);
});
