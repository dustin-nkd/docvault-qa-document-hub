import { gzipSync } from 'node:zlib';
import { importClosure } from './cloudflare-phase-7-api-client-policy.mjs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/**
 * Seventeen. Not fourteen, and not fifteen.
 *
 * Phase 7 was planned with fourteen stories. CF-P7-015 was added after the plan
 * was frozen and took the next free number, so the highest identifier ran ahead
 * of the last sequenced story and anyone reading the table by eye stopped at
 * fourteen — which is exactly how "13 of 14" reached four documents. CF-P7-016
 * and CF-P7-017 were then opened for a frozen-contract defect and for the
 * undispatched API shell. The count lives here, in one place, and the exit
 * report's own status line is checked against it rather than trusted.
 */
export const STORY_IDS = Object.freeze(['CF-P7-001', 'CF-P7-002', 'CF-P7-003', 'CF-P7-004',
    'CF-P7-005', 'CF-P7-006', 'CF-P7-007', 'CF-P7-008', 'CF-P7-009', 'CF-P7-010',
    'CF-P7-011', 'CF-P7-012', 'CF-P7-013', 'CF-P7-014', 'CF-P7-015', 'CF-P7-016',
    'CF-P7-017']);

export const REVIEW_ROLES = Object.freeze(['Product Owner', 'Senior QA', 'Security Reviewer',
    'Operations', 'Privacy Reviewer', 'UX Lead', 'Technical Lead']);

export const STORY_STATUSES = Object.freeze(['PASS', 'PARTIAL', 'OPEN']);

/** Pulled by the entry, but owned by Phase 5 and Phase 6. */
export const INHERITED_MODULES = Object.freeze(['js/collaboration/device-key-lifecycle.js',
    'js/collaboration/outbox.js', 'js/collaboration/conflict-resolution.js']);

export const ENTRY_MODULE = 'js/collaboration/entry.js';

/**
 * The lazy chunk, measured rather than asserted.
 *
 * `lazy_phase_7_chunk_max_kib_gzip: 60` sat in the sprint plan from the day it
 * was written and no script read it, so the first person to compare it against
 * bytes was CF-P7-013, at integration time, on a deployment. This recomputes it
 * from the working tree on every gate run.
 *
 * CRLF is normalised away on purpose. Git is configured `core.autocrlf=true`
 * here, so the same blob is 20 modules longer on a Windows checkout than in CI,
 * and a budget gate that reports two different numbers for the same commit is
 * not a measurement.
 */
export function measureLazyChunk(sources) {
    const closure = [...importClosure(sources, ENTRY_MODULE)].sort();
    const bytesOf = file => gzipSync(
        Buffer.from(String(sources[file]).replace(/\r\n/g, '\n'), 'utf8'), { level: 9 }).length;
    const total = closure.reduce((sum, file) => sum + bytesOf(file), 0);
    const phase7 = closure.filter(file => !INHERITED_MODULES.includes(file));
    return {
        modules: closure.length,
        bytes: total,
        kib: total / 1024,
        phase7Modules: phase7.length,
        phase7Bytes: phase7.reduce((sum, file) => sum + bytesOf(file), 0)
    };
}

export function validatePhase7Exit({ manifest, sprintPlan, previewManifest, exitReport, handoff,
    riskRegister, packageJson, evidenceSources, collaborationSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-014' && manifest.exit_gate === 'P7-G5',
    'Unsupported Phase 7 exit manifest');

    // Prose is checked against a line-wrap-insensitive copy. A sentence that
    // means the same thing either side of a newline should not be able to fail
    // a gate, and a gate should not be able to be satisfied by reflowing one.
    const prose = String(exitReport).replace(/\s+/g, ' ');

    // ── the arithmetic, computed and cross-checked rather than spelled ───────

    const stories = manifest.stories || [];
    assert(same(stories.map(story => story.id), STORY_IDS), 'Phase 7 story inventory drifted');
    assert(same((sprintPlan.stories || []).map(story => story.id), STORY_IDS),
        'The sprint plan and the exit manifest disagree about which stories exist');
    assert(manifest.story_count === STORY_IDS.length
        && sprintPlan.story_count === STORY_IDS.length,
    'A declared story count disagrees with the story inventory');

    const planStatus = new Map((sprintPlan.stories || []).map(story => [story.id, story.status]));
    for (const story of stories) {
        assert(STORY_STATUSES.includes(story.status),
            `${story.id} carries a status outside the closed set: ${story.status}`);
        assert(planStatus.get(story.id) === story.status,
            `${story.id} is ${story.status} here and ${planStatus.get(story.id)} in the sprint plan`);
    }

    const passing = stories.filter(story => story.status === 'PASS');
    assert(manifest.pass_count === passing.length,
        'The declared pass count disagrees with the story statuses');
    // The number in the document is the number the manifest computes. This is
    // the check that "13 of 14" would have failed.
    const statusLine = `${passing.length} of ${STORY_IDS.length} stories PASS`;
    assert(prose.includes(statusLine),
        `The exit report does not carry the computed count "${statusLine}"`);

    // ── CF-P7-013 and the qualification claim must agree across files ───────
    //
    // Checked before the evidence reconciliation below, deliberately. This is
    // the largest claim in the phase, and a manifest that upgrades CF-P7-013 to
    // PASS should be rejected for the reason that actually matters rather than
    // for the incidental one that its evidence records happen to read PARTIAL.

    const qualification = manifest.qualification || {};
    const qualified = qualification.journeys_qualified === true;
    assert(previewManifest.preview?.journeys_qualified === qualified,
        'The exit manifest and the Preview manifest disagree about whether a journey ran');
    const preview = stories.find(story => story.id === 'CF-P7-013');
    assert(qualified ? preview.status === 'PASS' : preview.status !== 'PASS',
        'CF-P7-013 cannot be PASS without a qualified journey, or PARTIAL with one');
    if (!qualified) {
        assert(typeof qualification.reason === 'string' && qualification.reason.length > 200,
            'An unqualified Phase 7 records no substantive reason');
        assert(qualification.signed_in_session_available_to_the_agent === false,
            'A journey that did not run cannot claim a session was available');
        assert(Array.isArray(qualification.measurements) && qualification.measurements.length >= 1
            && qualification.measurements.every(entry => Number.isInteger(entry.status)),
        'The unqualified verdict rests on no measurement');
        assert(qualification.production_still_refuses === true,
            'Production must still refuse collaboration');
    }

    // ── a story is PASS on a gate that exists and evidence that is written ───

    for (const story of passing) {
        assert(typeof story.gate === 'string' && story.gate.startsWith('cf:phase7:'),
            `${story.id} is PASS without an automated gate`);
        assert(packageJson.scripts?.[story.gate],
            `${story.id} names a gate that does not exist: ${story.gate}`);
        assert(Array.isArray(story.evidence) && story.evidence.length >= 1,
            `${story.id} is PASS and names no evidence`);
        for (const id of story.evidence) {
            const source = evidenceSources[id];
            assert(typeof source === 'string',
                `${story.id} names evidence that was never written: ${id}`);
            assert(/^Status:\s*\*{0,2}PASS/m.test(source),
                `${id} is not PASS evidence, but ${story.id} is PASS`);
            assert(source.includes(story.id), `${id} does not name ${story.id}`);
        }
    }
    // Anything short of PASS owes a reason long enough to act on.
    for (const story of stories.filter(entry => entry.status !== 'PASS')) {
        assert(typeof story.reason === 'string' && story.reason.length > 120,
            `${story.id} is ${story.status} without a substantive reason`);
        assert(story.evidence?.every(id => evidenceSources[id] !== undefined)
            || story.evidence_written === false,
        `${story.id} names unwritten evidence without saying so`);
    }
    assert(new Set(stories.flatMap(story => story.evidence || [])).size
        === stories.flatMap(story => story.evidence || []).length,
    'An evidence identifier is claimed by more than one story');

    // ── the lazy chunk, re-measured on every run ─────────────────────────────

    const budget = manifest.lazy_chunk_budget || {};
    const declared = sprintPlan.quality_budgets?.lazy_phase_7_chunk_max_kib_gzip;
    assert(declared === 60 && budget.declared_kib_gzip === declared,
        'The declared lazy-chunk budget was amended rather than met or renegotiated');
    assert(budget.amended === false, 'The lazy-chunk budget records itself as amended');

    const measured = measureLazyChunk(collaborationSources || {});
    assert(measured.modules >= 15,
        'The entry import closure could not be walked, so nothing was measured');
    const recorded = budget.local_measurement || {};
    const tolerance = recorded.tolerance_kib ?? 2;
    assert(Math.abs(measured.kib - recorded.kib_gzip) <= tolerance,
        `The recorded lazy-chunk measurement is stale: ${recorded.kib_gzip} KiB recorded, `
        + `${measured.kib.toFixed(2)} KiB measured`);
    assert(recorded.modules === measured.modules,
        'The recorded module count disagrees with the entry closure');
    // Bidirectional: OPEN while it breaches, and it may not stay OPEN once it
    // stops. A budget that can only ever be open is not being enforced either.
    assert(budget.status === (measured.kib > declared ? 'OPEN' : 'MET'),
        `The lazy-chunk budget is recorded ${budget.status} while measuring `
        + `${measured.kib.toFixed(2)} KiB against ${declared} KiB`);

    if (budget.status === 'OPEN') {
        assert(budget.enforced_by_gate === 'cf:phase7:exit:check',
            'The breached budget names no enforcing gate');
        assert(Array.isArray(budget.options) && budget.options.length >= 2,
            'An open budget breach records fewer than two options');
        for (const option of budget.options) {
            assert(typeof option.option === 'string' && option.option.length > 10
                && typeof option.consequence === 'string' && option.consequence.length > 60
                && typeof option.requires === 'string',
            `A budget option is not stated well enough to choose: ${option.option}`);
        }
        assert(typeof budget.deployment_measurement?.kib_gzip === 'number'
            && budget.deployment_measurement.kib_gzip > declared,
        'The deployment measurement behind the breach was dropped');
        // Owner-visible in both places, not only in a manifest nobody reads.
        const shown = String(budget.deployment_measurement.kib_gzip);
        assert(prose.includes(shown) && prose.includes('R-P7-B'),
            'The exit report does not carry the budget breach and its risk id');
        assert(riskRegister.includes('R-P7-B') && riskRegister.includes(shown)
            && riskRegister.includes(String(declared)),
        'The risk register does not carry the budget breach, its measurement, and the budget');
        assert(/Open/.test(riskRegister.slice(riskRegister.indexOf('R-P7-B'))),
            'The risk register does not record the budget breach as open');
    }

    // ── sign-off provenance, which may never be quietly upgraded ─────────────

    const signOff = manifest.sign_off || {};
    assert(signOff.model === 'single-maintainer-owner-authorization'
        && signOff.independent_reviewers_exist === false
        && signOff.independent_security_or_privacy_review_performed === false
        && signOff.blanket_in_session_instruction === true
        && signOff.line_by_line_reading === false
        && signOff.grants_p7_g5 === false
        && same(signOff.roles_covered || [], REVIEW_ROLES)
        && typeof signOff.note === 'string' && signOff.note.includes('single-maintainer'),
    'Phase 7 sign-off provenance drifted');
    for (const role of REVIEW_ROLES) {
        assert(prose.includes(role), `The exit report lacks the ${role} row`);
    }
    assert(/no independent security review/i.test(prose)
        && /no independent privacy review/i.test(prose),
    'The exit report stopped disclosing that no independent security or privacy review occurred');
    assert(/blanket/i.test(prose),
        'The exit report stopped recording the authorization as a blanket instruction');

    // ── P7-G5 is a consequence, never an assertion ──────────────────────────

    const conditions = manifest.p7_g5?.conditions || [];
    assert(conditions.length >= 5 && conditions.every(entry =>
        typeof entry.condition === 'string' && typeof entry.met === 'boolean'
        && typeof entry.state === 'string' && entry.state.length > 10),
    'The P7-G5 condition table is missing or unstated');
    const everyStoryPasses = passing.length === STORY_IDS.length;
    const noOpenDefect = budget.status !== 'OPEN';
    const grantable = everyStoryPasses && noOpenDefect && conditions.every(entry => entry.met);
    assert(manifest.exit_gate_granted === grantable && manifest.p7_g5?.granted === grantable,
        'P7-G5 is granted or withheld against its own conditions');
    if (!grantable) {
        assert(/\*\*NOT GRANTED\*\*/.test(prose),
            'The exit report does not say P7-G5 is not granted');
        assert(Array.isArray(manifest.open_items) && manifest.open_items.length >= 1,
            'Phase 7 is open and records no open item');
        for (const item of manifest.open_items) {
            assert(typeof item.owner === 'string' && item.owner.length > 2
                && typeof item.detail === 'string' && item.detail.length > 40,
            `An open item is unowned or unstated: ${item.item}`);
        }
        assert(manifest.decision?.phase_8_opening === 'NOT-AUTHORIZED',
            'Phase 8 cannot be authorized while P7-G5 is withheld');
        assert(!/^Status: \*\*CONTROLLING/m.test(handoff)
            && /`P7-G5` is NOT granted/.test(handoff),
        'The Phase 8 handoff must not read as controlling while P7-G5 is withheld');
    }

    // ── the boundary Phase 7 was never allowed to move ──────────────────────

    for (const key of ['collaboration_activation', 'production_identity', 'production_d1',
        'production_document_routes']) {
        assert(manifest.authorization_boundary?.[key] === 'NO-GO'
            && manifest.decision?.[key] === 'NO-GO', `Phase 7 exit boundary drifted: ${key}`);
    }
    assert(prose.includes('production never activates collaboration'),
        'The exit report dropped the boundary that matters');

    // The programme register is 22 rows and stays 22 rows; Phase 7's own exit
    // risks are carried under R-P7-* so a phase cannot renumber the programme.
    const riskRows = riskRegister.split(/\r?\n/).filter(line => /^\| R\d{2} \|/.test(line));
    assert(riskRows.length === 22, 'The programme risk register inventory changed');

    const exitEvidence = evidenceSources[manifest.evidence];
    assert(typeof exitEvidence === 'string'
        && exitEvidence.startsWith(`# ${manifest.evidence} `)
        && /^Status:\s*\*{0,2}PASS/m.test(exitEvidence)
        && /^Story:/m.test(exitEvidence)
        && exitEvidence.includes('CF-P7-014'),
    'The Phase 7 exit evidence record is missing, unstatused, or for another story');

    return true;
}
