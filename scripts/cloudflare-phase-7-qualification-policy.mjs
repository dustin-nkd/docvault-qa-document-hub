const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/** Every surface the frozen contract owns must be qualified. None may be skipped. */
export const REQUIRED_SURFACES = Object.freeze([
    'account-menu', 'workspace-switcher', 'create-workspace', 'device-key-initialization',
    'member-list-role-badge', 'invitation-manage', 'invitation-accept', 'sync-state',
    'conflict-dialog', 'audit-activity', 'base-states', 'github-pages-banner'
]);
export const BROWSERS = Object.freeze(['chromium', 'firefox', 'webkit']);

export function validatePhase7Qualification({ manifest, contract, harnessSource, result,
    packageJson }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-012' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P7-G3D' && manifest.next_gate === 'P7-G3E'
        && manifest.authorizes_on_approval === 'CF-P7-013',
    'Unsupported Phase 7 qualification manifest');

    // ── coverage: no surface may be quietly left out ─────────────────────────
    const contractSurfaces = (contract.surfaces || []).map(surface => surface.id);
    assert(same(contractSurfaces, REQUIRED_SURFACES),
        'The frozen contract no longer owns exactly the twelve qualified surfaces');
    assert(same(manifest.surfaces_qualified || [], REQUIRED_SURFACES),
        'A surface the contract owns is missing from the qualification');
    for (const surface of REQUIRED_SURFACES) {
        assert(harnessSource.includes(`'${surface}'`),
            `The harness does not render ${surface}`);
    }

    // ── U5 and U6 ────────────────────────────────────────────────────────────
    const ux = manifest.gate_ux || {};
    assert(same(ux.criteria || [], ['U5', 'U6']), 'The gate UX reference drifted');
    assert(same(ux.widths_px || [], (contract.responsive?.breakpoints_px) || []),
        'The qualified widths drifted from the frozen breakpoints');
    assert(same(ux.themes || [], ['dark', 'light']), 'A theme was dropped from the qualification');
    assert(same(ux.browsers || [], BROWSERS), 'A browser was dropped from the qualification');
    assert(ux.long_name_used === true,
        'The long-name case was dropped, so truncation is no longer exercised');
    for (const key of ['horizontal_page_scroll', 'overflowing_controls', 'clipped_text_nodes',
        'targets_under_24px', 'controls_without_visible_focus_ring',
        'disabled_controls_without_announced_reason', 'disabled_control_reached_by_tab']) {
        assert(ux[key] === 0, `The qualification claim is not zero: ${key}`);
    }
    assert(ux.dialog_accessible_name_resolves === true, 'The dialog name claim drifted');
    const floor = contract.accessibility?.focus_indicator_min_contrast;
    assert(ux.focus_ring_contrast_floor === floor,
        'The focus contrast floor drifted from the frozen accessibility baseline');
    assert(typeof ux.lowest_focus_ring_contrast === 'number'
        && ux.lowest_focus_ring_contrast >= floor,
    `The lowest measured focus ring contrast is below the ${floor}:1 floor`);

    // The recorded result must agree with the claim, browser for browser.
    const summary = result?.summary || [];
    assert(same(summary.map(entry => entry.browser), BROWSERS),
        'The recorded qualification result does not cover the required browsers');
    for (const entry of summary) {
        assert(entry.widths === 6,
            `${entry.browser}: expected three widths in two themes, recorded ${entry.widths}`);
        assert(entry.lowestRingContrast >= floor,
            `${entry.browser}: focus ring contrast ${entry.lowestRingContrast} below the floor`);
        assert(entry.focusable > 0 && entry.disabled > 0,
            `${entry.browser}: nothing was actually measured`);
    }

    // ── declared limits: narrowed coverage must be stated, never silent ──────
    const limits = manifest.declared_limits || {};
    assert(Array.isArray(limits.tab_traversal_asserted_in)
        && limits.tab_traversal_asserted_in.length > 0,
    'The set of browsers where traversal is asserted was dropped');
    const covered = [...(limits.tab_traversal_asserted_in || []),
        ...(limits.tab_traversal_not_driven_in || [])];
    assert(same(covered, BROWSERS),
        'A browser is neither asserted nor declared undriven, which is a silent gap');
    assert(typeof limits.reason === 'string' && limits.reason.length > 80,
        'The reason traversal is narrowed was dropped');
    for (const key of ['clipped_text_excludes_form_fields',
        'focus_audit_excludes_unrendered_controls']) {
        assert(limits[key] === true, `A measurement exclusion is no longer declared: ${key}`);
    }
    assert(typeof limits.clipped_text_exclusion_reason === 'string'
        && limits.clipped_text_exclusion_reason.length > 60,
    'The clipped-text exclusion has no stated reason');
    assert(typeof limits.focus_audit_exclusion_reason === 'string'
        && limits.focus_audit_exclusion_reason.length > 60,
    'The focus-audit exclusion has no stated reason');
    // The harness must log the narrowing at run time, not only in the manifest.
    assert(/traversal not driven/.test(harnessSource),
        'The harness no longer states its narrowed traversal at run time');

    // ── the defect this story existed to find ────────────────────────────────
    const defects = manifest.defects_found_and_fixed || [];
    assert(Array.isArray(defects) && defects.length > 0,
        'The qualification records no findings, which is not what a cross-cutting story looks like');
    for (const defect of defects) {
        assert(typeof defect.defect === 'string' && typeof defect.cause === 'string'
            && typeof defect.fix === 'string' && Array.isArray(defect.surfaces),
        'A recorded defect is missing its cause, fix, or affected surfaces');
    }

    // ── the harness runs in CI ───────────────────────────────────────────────
    const scripts = packageJson?.scripts || {};
    assert(scripts[manifest.npm_script] === `node ${manifest.harness}`,
        'The qualification harness is not wired to its npm script');
    assert((scripts['test:e2e'] || '').includes(manifest.npm_script),
        'The qualification does not run in the release browser suite');
    return true;
}
