const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const BASE_STATES = Object.freeze(['empty', 'loading', 'unauthorized', 'error']);
export const SURFACES = Object.freeze(['base-states', 'github-pages-banner']);
export const PERSONAL_KEYS = Object.freeze(['docvault_docs', 'docvault_deleted_ids',
    'docvault_sync_pending', 'DocStorage']);

export function validatePhase7Shell({ manifest, contract, deploymentSource, baseStatesSource,
    shellSource, indexHtml, serviceWorker, styleSource, unitTestSource }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-002' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P7-G1' && manifest.next_gate === 'P7-G2'
        && manifest.authorizes_on_approval === 'CF-P7-003',
    'Unsupported Phase 7 shell manifest');

    // The two surfaces this story owns must be the two the contract assigns it.
    assert(same(manifest.surfaces || [], SURFACES), 'The owned surface set drifted');
    for (const id of SURFACES) {
        const surface = (contract.surfaces || []).find(item => item.id === id);
        assert(surface?.owner === 'CF-P7-002',
            `Surface ${id} is not owned by CF-P7-002 in the frozen contract`);
    }
    assert(same(manifest.base_states || [], BASE_STATES), 'The base state set drifted');

    // Laziness is structural, not a claim: assert it against the real files.
    const laziness = manifest.laziness || {};
    assert(laziness.eager_script_tag === false && laziness.service_worker_precached === false
        && laziness.collaboration_modules_on_personal_startup === 0,
    'The laziness claim drifted');
    assert(!/<script[^>]+collaboration\//.test(indexHtml),
        'A collaboration module became an eager script tag');
    assert(!/collaboration/.test(serviceWorker),
        'A collaboration module entered the service worker precache');

    // The banner has to work with zero collaboration code, so its module must
    // sit outside the collaboration namespace and be eagerly available.
    assert(laziness.deployment_module_outside_collaboration_namespace === true
        && manifest.modules?.deployment === 'js/deployment.js'
        && !manifest.modules.deployment.includes('collaboration'),
    'The deployment predicate moved into the collaboration namespace');
    assert(indexHtml.includes('<script defer src="js/deployment.js"></script>'),
        'The deployment module is not loaded by the app shell');
    assert(serviceWorker.includes('./js/deployment.js'),
        'The deployment module is not precached with the app shell');
    assert(indexHtml.includes('id="collaboration-availability-banner"')
        && /id="collaboration-availability-banner"[^>]*\bhidden\b/.test(indexHtml),
    'The availability banner is missing or does not ship hidden');
    assert(indexHtml.includes('id="collaboration-root"'), 'The shell mount point is missing');

    // Deployment detection fails closed and is about the deployment, not the user.
    const detection = manifest.deployment_detection || {};
    assert(detection.fails_closed_on_unknown_origin === true,
        'An unrecognised origin no longer fails closed');
    assert(detection.availability_is_deployment_not_session === true,
        'Availability was conflated with authentication');
    assert(/unsupported-origin/.test(deploymentSource) && /github-pages/.test(deploymentSource),
        'The deployment reasons are not implemented');
    assert(!/\.pages\.dev[^\n]*\|\|[^\n]*github\.io/.test(deploymentSource),
        'GitHub Pages was folded into the available branch');

    // No state may be signalled by colour alone, and denials must explain.
    const signals = manifest.state_signals || {};
    assert(signals.distinct_shape_per_state === true && signals.colour_only === false,
        'Colour-only state signalling was permitted');
    assert(same(signals.reason_required_for || [], ['unauthorized', 'error']),
        'The set of states owing an explanation drifted');
    assert(signals.decorative_shape_aria_hidden === true,
        'The decorative shape is no longer hidden from assistive technology');
    assert(/REASON_REQUIRED/.test(baseStatesSource),
        'The base states no longer enforce a reason');
    assert(/aria-hidden/.test(baseStatesSource) && /role', 'status'/.test(baseStatesSource),
        'The base state accessibility semantics were dropped');
    for (const state of BASE_STATES) {
        assert(styleSource.includes(`collab-state--${state}`)
            || styleSource.includes('collab-state__shape--'),
        `No style hook exists for the ${state} state`);
    }
    assert(/collab-state__shape--square/.test(styleSource)
        && /collab-state__shape--lock/.test(styleSource)
        && /collab-state__shape--triangle/.test(styleSource)
        && /collab-state__shape--spinner/.test(styleSource),
    'A state lost its distinct shape');
    assert(/focus-visible/.test(styleSource), 'The visible focus requirement was dropped');

    // Isolation: the shell may not touch personal storage, or inject markup.
    const isolation = manifest.isolation || {};
    assert(isolation.personal_storage_keys_referenced === 0
        && isolation.inner_html_used === false && isolation.clears_on_unmount === true,
    'The isolation claim drifted');
    for (const key of PERSONAL_KEYS) {
        assert(!shellSource.includes(key) && !baseStatesSource.includes(key),
            `The shell reached for personal storage: ${key}`);
    }
    // Match the property access, not the word: the modules discuss innerHTML in
    // comments precisely because they must never use it.
    assert(!/\.innerHTML/.test(shellSource) && !/\.innerHTML/.test(baseStatesSource),
        'The shell renders through innerHTML');
    assert(/textContent/.test(baseStatesSource),
        'The base states no longer set text through textContent');
    assert(/replaceChildren\(\)/.test(shellSource),
        'The shell no longer clears workspace content on unmount');

    // The suite must actually exist and be counted.
    const tests = manifest.tests || {};
    assert(typeof tests.unit === 'string' && typeof tests.policy === 'string',
        'The shell story ships without both a unit and a policy suite');
    const declared = tests.unit_count;
    const actual = (unitTestSource.match(/^test\(/gm) || []).length;
    assert(declared === actual,
        `Unit test inventory drifted: manifest says ${declared}, suite has ${actual}`);
    return true;
}
