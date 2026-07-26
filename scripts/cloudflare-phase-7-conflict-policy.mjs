const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const SURFACES = Object.freeze(['conflict-dialog']);
export const RESOLUTIONS = Object.freeze(['review-latest', 'reapply-to-latest',
    'save-as-separate-copy', 'discard-with-confirmation']);
/** A dialog holding a draft itself would be a second persistence path. */
export const STORAGE_APIS = Object.freeze(['localStorage', 'sessionStorage', 'indexedDB',
    'caches.', 'document.cookie']);
export const PERSONAL_KEYS = Object.freeze(['docvault_docs', 'docvault_deleted_ids',
    'docvault_sync_pending', 'DocStorage']);

/** Strip comments before asserting a construct is absent. */
export function code(source) {
    return String(source)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function validatePhase7Conflict({ manifest, contract, journeySource, serviceSource,
    styleSource, indexHtml, serviceWorker, unitTestSource, journeyExports }) {
    const journeyCode = code(journeySource);
    const exported = journeyExports || {};

    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-010' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P7-G3B' && manifest.next_gate === 'P7-G3C'
        && manifest.authorizes_on_approval === 'CF-P7-011',
    'Unsupported Phase 7 conflict manifest');

    assert(same(manifest.surfaces || [], SURFACES), 'The owned surface set drifted');
    const surface = (contract.surfaces || []).find(item => item.id === 'conflict-dialog');
    assert(surface?.owner === 'CF-P7-010',
        'Surface conflict-dialog is not owned by CF-P7-010 in the frozen contract');
    assert(same(surface.actions || [], RESOLUTIONS),
        'The dialog no longer offers the resolutions the frozen contract gives it');
    assert(same((contract.inherited_vocabularies?.conflict_resolutions) || [], RESOLUTIONS),
        'The frozen contract no longer lists exactly these four resolutions');

    // ── U4 ───────────────────────────────────────────────────────────────────
    const ux = manifest.gate_ux || {};
    assert(ux.criterion === 'U4', 'The gate UX reference was dropped');
    assert(same(ux.resolutions || [], RESOLUTIONS), 'The resolution set drifted');
    assert(ux.destructive_resolutions === 1, 'The number of destructive resolutions drifted');
    assert(ux.automatic_merge_offered === false && ux.automatic_merge_refused_by_service === true,
        'An automatic merge may now be offered');
    for (const key of ['dismiss_resolves_nothing', 'dismiss_retains_draft',
        'discard_requires_arming', 'discard_requires_confirmation',
        'discard_withheld_without_a_held_draft', 'every_resolution_states_its_consequence']) {
        assert(ux[key] === true, `The U4 claim drifted: ${key}`);
    }
    assert(typeof ux.rationale === 'string' && ux.rationale.length > 200,
        'The reason the dialog does not hold the draft was dropped');

    // Exercised, not read: each guard is driven to its refusal.
    const choose = exported.chooseResolution;
    const dismiss = exported.dismissDialog;
    const model = exported.conflictDialogModel;
    const merge = exported.requestAutomaticMerge;
    assert(typeof choose === 'function' && typeof dismiss === 'function'
        && typeof model === 'function' && typeof merge === 'function',
    'The dialog functions were not provided');
    const conflict = exported.sampleConflict;
    assert(conflict !== undefined, 'A sample conflict was not provided');

    const dismissed = dismiss(conflict);
    assert(dismissed.resolved === false && dismissed.draftRetained === true,
        'Dismissing the dialog now resolves the conflict or drops the draft');

    let armedRefusal = null;
    try {
        choose({ conflict, option: 'discard-with-confirmation', draftHeld: true });
    } catch (error) { armedRefusal = error.code; }
    assert(armedRefusal === 'DISCARD_NOT_ARMED', 'A discard no longer requires arming');

    let confirmRefusal = null;
    try {
        choose({ conflict, option: 'discard-with-confirmation', draftHeld: true, armed: true });
    } catch (error) { confirmRefusal = error.code; }
    assert(confirmRefusal === 'DISCARD_NOT_CONFIRMED', 'A discard no longer requires confirmation');

    let noDraftRefusal = null;
    try {
        choose({ conflict, option: 'discard-with-confirmation', draftHeld: false,
            armed: true, confirmed: true });
    } catch (error) { noDraftRefusal = error.code; }
    assert(noDraftRefusal === 'NO_DRAFT_TO_DISCARD',
        'A discard is offered where there is no draft to discard');

    let mergeRefusal = null;
    try { merge(); } catch (error) { mergeRefusal = error.code; }
    assert(mergeRefusal === 'AUTOMATIC_MERGE_PROHIBITED',
        'An automatic merge is no longer refused');
    assert(/AUTOMATIC_MERGE_PROHIBITED/.test(serviceSource),
        'The service no longer refuses an automatic merge');

    const described = model({ conflict, draftHeld: true });
    assert(described.options.filter(option => option.destroys).length === 1,
        'The destructive resolution count changed in the live model');
    for (const option of described.options) {
        assert(typeof option.consequence === 'string' && option.consequence.length > 30,
            `${option.option} no longer states its consequence`);
    }
    assert(model({ conflict, draftHeld: false }).options
        .find(option => option.destroys).available === false,
    'The destructive option is offered without a held draft');

    // ── the draft is not held here ───────────────────────────────────────────
    const persistence = manifest.persistence || {};
    assert(persistence.second_persistence_path_opened === false
        && persistence.storage_apis_referenced === 0,
    'The dialog claims a persistence path of its own');
    assert(typeof persistence.draft_persisted_by === 'string'
        && persistence.draft_persisted_by.includes('outbox'),
    'The draft is no longer persisted by the outbox');
    for (const api of STORAGE_APIS) {
        assert(!journeyCode.includes(api),
            `The dialog opened a second persistence path via ${api}`);
    }
    assert(/from '\.\/conflict-resolution\.js'/.test(journeySource),
        'The dialog no longer delegates to the CF-P6-007 service');

    // ── accessibility ────────────────────────────────────────────────────────
    const a11y = manifest.accessibility || {};
    assert(a11y.role === 'dialog' && a11y.aria_modal === true && a11y.labelled_by_title === true,
        'The dialog semantics drifted');
    assert(a11y.focus_moved_on_open === true && a11y.focus_restored_on_close === true,
        'Focus management drifted');
    assert(a11y.focus_trap === false, 'A focus trap was introduced, which the contract prohibits');
    assert(a11y.consequence_associated_with_each_choice === true
        && a11y.ids_scoped_per_instance === true, 'The accessibility claim drifted');
    assert(/role', 'dialog'/.test(journeyCode) && /aria-modal/.test(journeySource),
        'The dialog is no longer announced as a modal dialog');
    assert(/aria-labelledby/.test(journeySource), 'The dialog lost its accessible name');
    assert(/aria-describedby/.test(journeySource),
        'A choice is no longer described by its consequence');
    assert(/\$\{instanceId\}-/.test(journeySource),
        'Dialog ids are no longer scoped to the rendered instance');
    assert(!/addEventListener\(\s*'keydown'/.test(journeyCode),
        'A key handler here is the beginning of a focus trap');
    assert(/first\.focus\(\)/.test(journeyCode) && /target\.focus\(\)/.test(journeyCode),
        'Focus is no longer moved on open and restored on close');
    assert(/collab-conflict__consequence/.test(styleSource),
        'The consequence text has no style hook');

    // ── isolation ────────────────────────────────────────────────────────────
    const isolation = manifest.isolation || {};
    for (const key of ['inner_html_used', 'eager_script_tag', 'service_worker_precached',
        'network_call_in_module']) {
        assert(isolation[key] === false, `The isolation claim drifted: ${key}`);
    }
    assert(isolation.personal_storage_keys_referenced === 0, 'The isolation claim drifted');
    for (const key of PERSONAL_KEYS) {
        assert(!journeyCode.includes(key), `The dialog reached for ${key}`);
    }
    assert(!/\.innerHTML/.test(journeyCode), 'The dialog renders through innerHTML');
    assert(!/\bfetch\s*\(/.test(journeyCode), 'The dialog performs its own transport');
    assert(!/<script[^>]+collaboration\//.test(indexHtml),
        'A collaboration module became an eager script tag');
    assert(!/collaboration/.test(serviceWorker),
        'A collaboration module entered the service worker precache');

    const tests = manifest.tests || {};
    const actual = (unitTestSource.match(/^test\(/gm) || []).length;
    assert(tests.unit_count === actual,
        `Unit test inventory drifted: manifest says ${tests.unit_count}, suite has ${actual}`);
    assert(typeof tests.policy === 'string', 'The story ships without a policy suite');
    return true;
}
