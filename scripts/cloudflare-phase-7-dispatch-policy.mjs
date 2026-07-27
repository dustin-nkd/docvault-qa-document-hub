// CF-P7-017 — dispatch the API shell when the collaboration flag is on, and
// keep refusing when it is off.
//
// The defect this closes was not in api-shell.mjs's dispatch — that file was
// never the door. functions/api/v1/[[path]].ts already gave
// handleIdentityRuntime, handlePreviewKeyFoundationApi, and
// handlePreviewCollaborationApi first refusal on every request, ahead of the
// api-shell.mjs fallback. Every one of them gates on
// resolveIdentityRuntime(...).enabled, and that function required
// COLLABORATION_ENABLED === 'false' to enable — backwards from the flag's
// name and from D-P7-01, which set it to 'true' for Preview precisely to turn
// this on. With the polarity inverted, all three doors reported disabled on
// Preview and every request fell through to api-shell.mjs's unconditional 503.
//
// This gate is source-level and structural, not a live-deployment check: it
// cannot observe a real Preview build (no agent can push and rebuild inside a
// policy script), but it can prove the fix is present, that the three
// dispatch doors are still composed ahead of the fallback in the declared
// order, that api-shell.mjs's own fallback no longer computes a distinction
// it discards, and that the workers test suite exercises the flag both ways
// and asserts two different outcomes rather than one.

const assert = (condition, message) => { if (!condition) throw new Error(message); };

/** Strip comments before asserting a construct is *absent* from source. */
function code(source) {
    return String(source)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function validatePhase7Dispatch({ manifest, environmentSource, apiShellSource, routeSource,
    identityRuntimeTestSource, identityPrimitivesTestSource, evidence, decisionLog }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7' && manifest.story === 'CF-P7-017',
        'Unsupported Phase 7 dispatch manifest');
    assert(manifest.status === 'PASS', 'CF-P7-017 manifest does not record PASS');
    assert(manifest.chosen_option === 'A', 'The owner decision this story required was not recorded');

    // ── the root cause: the polarity, read from the corrected file itself ────
    const environmentCode = code(environmentSource);
    assert(/COLLABORATION_ENABLED\s*!==\s*'true'/.test(environmentCode),
        'environment.ts no longer requires the flag to equal \'true\' to enable');
    assert(!/COLLABORATION_ENABLED\s*!==\s*'false'/.test(environmentCode),
        'environment.ts still carries the inverted polarity check');

    // ── the composition that was already correct, still intact ──────────────
    // [[path]].ts gives the three enabled-aware handlers first refusal, in this
    // order, before ever reaching the always-503 fallback. This is what made the
    // environment.ts fix sufficient on its own: nothing else needed to learn to
    // dispatch, because dispatch already lived here.
    const doors = ['handleIdentityRuntime', 'handlePreviewKeyFoundationApi',
        'handlePreviewCollaborationApi', 'handleApiRequest'];
    let cursor = -1;
    for (const door of doors) {
        const at = routeSource.indexOf(door, cursor + 1);
        assert(at > cursor, `${door} is missing or out of order in functions/api/v1/[[path]].ts`);
        cursor = at;
    }
    assert(!/\bnext\s*\(|passThroughOnException|\bfetch\s*\(/.test(routeSource),
        'The Pages Function route stopped being a pure composition of the four handlers');

    // ── the fallback shell: honest, and no longer a dead double-branch ───────
    const shellCode = code(apiShellSource);
    assert(!/hasReviewedDisabledState/.test(shellCode),
        'api-shell.mjs still computes the discarded boolean this story removed');
    // The fallback must still answer only 503 COLLABORATION_UNAVAILABLE for
    // every request that reaches it — it dispatches nothing itself, by design;
    // dispatch lives in the three doors above. Its own tests (tests/api-shell.
    // test.mjs) are the ones pinning that this behaviour did not change, and
    // this gate does not re-run them; it only confirms the dead branch is gone.
    const returns = [...shellCode.matchAll(/errorResponse\(([^)]*)\)/g)];
    const withinBoundary = returns.filter(match => /COLLABORATION_UNAVAILABLE/.test(match[1]));
    assert(withinBoundary.length === 1,
        'api-shell.mjs should answer the disabled/unimplemented boundary from exactly one return, '
        + `found ${withinBoundary.length}`);

    // ── the tests: both directions, not just one ─────────────────────────────
    assert(/COLLABORATION_ENABLED:\s*'true'/.test(identityRuntimeTestSource),
        'The runtime workers test no longer models an enabled Preview configuration');
    assert(/dispatches when COLLABORATION_ENABLED is true and refuses when it is anything else/
        .test(identityRuntimeTestSource),
    'The on/off dispatch contrast test is missing from identity-runtime.workers.test.ts');
    assert(/COLLABORATION_ENABLED:\s*'false'\s*\}\)\)\)\.toBeNull\(\)/.test(identityRuntimeTestSource)
        || /COLLABORATION_ENABLED: 'false' \}\)\)\)\.toBeNull\(\)/.test(identityRuntimeTestSource),
    'The dispatch test no longer proves the flag off still refuses');

    assert(/COLLABORATION_ENABLED: 'true',/.test(identityPrimitivesTestSource),
        'The identity-primitives fixture no longer models an enabled configuration');
    assert(/COLLABORATION_ENABLED: 'false' \}\)/.test(identityPrimitivesTestSource),
        'The unit test no longer proves an explicit false disables an otherwise-valid configuration');
    assert(/enabled: true, mode: 'preview-only'/.test(identityPrimitivesTestSource),
        'The unit test no longer proves the true configuration enables');

    // ── the decision must be on the record, not only in this manifest ───────
    assert(decisionLog.includes('CF-P7-017'), 'The decision log does not record CF-P7-017');
    assert(/environment\.ts/.test(decisionLog) && /polarity/i.test(decisionLog),
        'The decision log does not name what was decided');

    // ── evidence must exist, be PASS, and name this story ────────────────────
    assert(typeof evidence === 'string' && /^Status:\s*\*{0,2}PASS/m.test(evidence)
        && evidence.includes('CF-P7-017'), 'CF-EV-P7-OPS-006 is missing, unstatused, or misnamed');
    assert(/environment\.ts/.test(evidence) && /api-shell\.mjs/.test(evidence),
        'The evidence does not name the two files this story changed');

    return true;
}
