// Drift tests for the CF-P7-014 gate. Each case breaks one thing and asserts
// the policy rejects it, so the gate is known to bite rather than assumed to.
//
// The first test is a no-op control: the repository as it stands must be
// ACCEPTED. Without it a suite whose input is already broken passes every
// rejection case while checking nothing at all, and this programme has shipped
// sixteen green vacuous suites once already.
//
// Source mutations assert the replacement actually changed the text before
// asserting the rejection. Git renormalises line endings on checkout, so a
// pattern written with \n can silently fail to match on a CRLF working copy.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7Exit, measureLazyChunk, STORY_IDS, REVIEW_ROLES }
    from '../scripts/cloudflare-phase-7-exit-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-7');
const collaborationDirectory = path.join(root, 'js/collaboration');

const collaborationSources = () => Object.fromEntries(fs.readdirSync(collaborationDirectory)
    .filter(name => name.endsWith('.js'))
    .map(name => [`js/collaboration/${name}`,
        fs.readFileSync(path.join(collaborationDirectory, name), 'utf8')]));

const input = () => ({
    manifest: json('config/cloudflare/phase-7-exit-gate.json'),
    sprintPlan: json('config/cloudflare/phase-7-sprint-plan.json'),
    previewManifest: json('config/cloudflare/phase-7-preview-integration.json'),
    exitReport: read('docs/collaboration-foundation/phase-7-exit-report.md'),
    handoff: read('docs/collaboration-foundation/phase-8-handoff.md'),
    riskRegister: read('docs/collaboration-foundation/risk-register.md'),
    packageJson: json('package.json'),
    evidenceSources: Object.fromEntries(fs.readdirSync(evidenceDirectory)
        .filter(name => /^CF-EV-P7-.*\.md$/.test(name))
        .map(name => [name.replace(/\.md$/, ''),
            fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')])),
    collaborationSources: collaborationSources()
});

/** Replace and prove the replacement landed, so a no-op mutation cannot pass. */
const mutated = (source, pattern, replacement) => {
    const result = source.replace(pattern, replacement);
    assert.notEqual(result, source, `mutation did not apply: ${pattern}`);
    return result;
};

const storyIn = (manifest, id) => manifest.stories.find(story => story.id === id);

// ── the no-op control ────────────────────────────────────────────────────────

test('the policy accepts the repository as it stands', () => {
    assert.equal(validatePhase7Exit(input()), true);
});

test('the inventory is seventeen stories, not fourteen and not fifteen', () => {
    assert.equal(STORY_IDS.length, 17);
    assert.equal(STORY_IDS.at(-1), 'CF-P7-017');
});

// ── the manifest is the story it claims to be ────────────────────────────────

test('a manifest for another story is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.story = 'CF-P7-013';
    assert.throws(() => validatePhase7Exit(drifted), /Unsupported Phase 7 exit manifest/);
});

test('a manifest for another exit gate is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.exit_gate = 'P7-G4A';
    assert.throws(() => validatePhase7Exit(drifted), /Unsupported Phase 7 exit manifest/);
});

// ── the arithmetic ───────────────────────────────────────────────────────────

test('dropping a story from the inventory is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.stories = drifted.manifest.stories.filter(story => story.id !== 'CF-P7-017');
    assert.throws(() => validatePhase7Exit(drifted), /story inventory drifted/);
});

test('the fourteen-story reading that produced "13 of 14" is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.stories = drifted.manifest.stories
        .filter(story => !['CF-P7-015', 'CF-P7-016', 'CF-P7-017'].includes(story.id));
    drifted.manifest.story_count = 14;
    assert.throws(() => validatePhase7Exit(drifted), /story inventory drifted/);
});

test('a story count that disagrees with the inventory is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.story_count = 15;
    assert.throws(() => validatePhase7Exit(drifted), /disagrees with the story inventory/);
});

test('a sprint plan count that disagrees with the inventory is rejected', () => {
    const drifted = input();
    drifted.sprintPlan = clone(drifted.sprintPlan);
    drifted.sprintPlan.story_count = 15;
    assert.throws(() => validatePhase7Exit(drifted), /disagrees with the story inventory/);
});

test('a pass count that does not match the story statuses is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.pass_count += 1;
    assert.throws(() => validatePhase7Exit(drifted), /pass count disagrees/);
});

test('an exit report whose status line contradicts the computed count is rejected', () => {
    const drifted = input();
    // Every occurrence, not the first: the count appears in the status line and
    // again in §2, and replacing one would leave the gate satisfied by the other.
    drifted.exitReport = mutated(drifted.exitReport, /16 of 17 stories PASS/g,
        '13 of 14 stories PASS');
    assert.throws(() => validatePhase7Exit(drifted), /does not carry the computed count/);
});

test('a story that is PASS here and PARTIAL in the sprint plan is rejected', () => {
    const drifted = input();
    drifted.sprintPlan = clone(drifted.sprintPlan);
    drifted.sprintPlan.stories.find(story => story.id === 'CF-P7-014').status = 'PARTIAL';
    assert.throws(() => validatePhase7Exit(drifted), /in the sprint plan/);
});

test('a status outside the closed set is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    storyIn(drifted.manifest, 'CF-P7-017').status = 'DONE-ISH';
    assert.throws(() => validatePhase7Exit(drifted), /outside the closed set/);
});

// ── PASS needs a gate that exists and evidence that is written ───────────────

test('a PASS story with no gate is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    delete storyIn(drifted.manifest, 'CF-P7-014').gate;
    assert.throws(() => validatePhase7Exit(drifted), /PASS without an automated gate/);
});

test('a PASS story naming a gate that does not exist is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    storyIn(drifted.manifest, 'CF-P7-014').gate = 'cf:phase7:imaginary:check';
    assert.throws(() => validatePhase7Exit(drifted), /names a gate that does not exist/);
});

test('a PASS story naming evidence that was never written is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    storyIn(drifted.manifest, 'CF-P7-014').evidence = ['CF-EV-P7-EXIT-999'];
    assert.throws(() => validatePhase7Exit(drifted), /evidence that was never written/);
});

test('a PASS story resting on PARTIAL evidence is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    storyIn(drifted.manifest, 'CF-P7-014').evidence = ['CF-EV-P7-OPS-005'];
    assert.throws(() => validatePhase7Exit(drifted), /is not PASS evidence/);
});

test('evidence downgraded to PARTIAL under a PASS story is rejected', () => {
    const drifted = input();
    drifted.evidenceSources = { ...drifted.evidenceSources };
    drifted.evidenceSources['CF-EV-P7-EXIT-001'] = mutated(
        drifted.evidenceSources['CF-EV-P7-EXIT-001'], /^Status: PASS$/m, 'Status: PARTIAL');
    assert.throws(() => validatePhase7Exit(drifted), /is not PASS evidence|exit evidence record/);
});

test('a story that is not PASS without a substantive reason is rejected', () => {
    // CF-P7-017 closed in this pass (see CF-EV-P7-OPS-006), leaving CF-P7-013 as
    // the only non-PASS story to exercise this path against.
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    storyIn(drifted.manifest, 'CF-P7-013').reason = 'todo';
    assert.throws(() => validatePhase7Exit(drifted), /without a substantive reason/);
});

test('a non-PASS story naming unwritten evidence without saying so is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    const story = storyIn(drifted.manifest, 'CF-P7-013');
    story.evidence = [...story.evidence, 'CF-EV-P7-OPS-999'];
    assert.throws(() => validatePhase7Exit(drifted), /names unwritten evidence without saying so/);
});

test('two stories claiming one evidence record is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    storyIn(drifted.manifest, 'CF-P7-013').evidence.push('CF-EV-P7-EXIT-001');
    assert.throws(() => validatePhase7Exit(drifted), /claimed by more than one story/);
});

// ── CF-P7-013 and the journey claim ─────────────────────────────────────────

test('claiming CF-P7-013 PASS without a qualified journey is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    storyIn(drifted.manifest, 'CF-P7-013').status = 'PASS';
    drifted.manifest.pass_count += 1;
    drifted.sprintPlan = clone(drifted.sprintPlan);
    drifted.sprintPlan.stories.find(story => story.id === 'CF-P7-013').status = 'PASS';
    drifted.exitReport = mutated(drifted.exitReport, /16 of 17 stories PASS/g,
        '17 of 17 stories PASS');
    assert.throws(() => validatePhase7Exit(drifted), /cannot be PASS without a qualified journey/);
});

test('claiming a journey the Preview manifest does not record is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.qualification.journeys_qualified = true;
    assert.throws(() => validatePhase7Exit(drifted), /disagree about whether a journey ran/);
});

test('an unqualified verdict that claims a session was available is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.qualification.signed_in_session_available_to_the_agent = true;
    assert.throws(() => validatePhase7Exit(drifted), /cannot claim a session was available/);
});

test('an unqualified verdict resting on no measurement is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.qualification.measurements = [];
    assert.throws(() => validatePhase7Exit(drifted), /rests on no measurement/);
});

test('an unqualified verdict with a vague reason is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.qualification.reason = 'blocked on the owner';
    assert.throws(() => validatePhase7Exit(drifted), /records no substantive reason/);
});

test('recording that production stopped refusing collaboration is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.qualification.production_still_refuses = false;
    assert.throws(() => validatePhase7Exit(drifted), /Production must still refuse/);
});

// ── the lazy chunk, measured on every run ───────────────────────────────────

test('the measurement walks a real closure and breaches the declared budget', () => {
    const measured = measureLazyChunk(collaborationSources());
    assert.equal(measured.modules, 22);
    assert.equal(measured.phase7Modules, 19);
    assert.ok(measured.kib > 60, 'the breach this gate exists to record is real');
    assert.ok(measured.phase7Bytes / 1024 > 60, 'it breaches under the narrowest reading too');
});

test('silently amending the declared budget is rejected', () => {
    const drifted = input();
    drifted.sprintPlan = clone(drifted.sprintPlan);
    drifted.sprintPlan.quality_budgets.lazy_phase_7_chunk_max_kib_gzip = 85;
    assert.throws(() => validatePhase7Exit(drifted), /was amended rather than met or renegotiated/);
});

test('a manifest that amends the budget behind the plan is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.lazy_chunk_budget.declared_kib_gzip = 85;
    assert.throws(() => validatePhase7Exit(drifted), /was amended rather than met or renegotiated/);
});

test('a budget that records itself as amended is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.lazy_chunk_budget.amended = true;
    assert.throws(() => validatePhase7Exit(drifted), /records itself as amended/);
});

test('a closure that cannot be walked is rejected rather than measured as zero', () => {
    const drifted = input();
    drifted.collaborationSources = {};
    assert.throws(() => validatePhase7Exit(drifted), /could not be walked/);
});

test('a stale recorded measurement is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.lazy_chunk_budget.local_measurement.kib_gzip = 61;
    assert.throws(() => validatePhase7Exit(drifted), /measurement is stale/);
});

test('a recorded module count that disagrees with the closure is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.lazy_chunk_budget.local_measurement.modules = 19;
    assert.throws(() => validatePhase7Exit(drifted), /module count disagrees/);
});

test('recording the breached budget as met is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.lazy_chunk_budget.status = 'MET';
    assert.throws(() => validatePhase7Exit(drifted), /is recorded MET while measuring/);
});

test('a chunk that comes under budget while the record still says OPEN is rejected', () => {
    // The other direction, which is the one a stale record fails silently in:
    // if the modules ever shrink, an OPEN breach must be closed, not carried.
    const drifted = input();
    // Every module keeps its import lines and loses its body, so the graph is
    // still the real twenty-module closure and only the bytes shrink. Stubbing
    // the bodies away entirely would break the transitive walk and trip the
    // could-not-be-walked guard instead, which is a different case.
    drifted.collaborationSources = Object.fromEntries(
        Object.entries(drifted.collaborationSources).map(([file, source]) => [file,
            `${source.split(/\r?\n/).filter(line => /from\s*'\.\//.test(line)).join('\n')}\n`]));
    drifted.manifest = clone(drifted.manifest);
    const measured = measureLazyChunk(drifted.collaborationSources);
    assert.equal(measured.modules, 22, 'the shrunken fixture must keep the whole closure');
    assert.ok(measured.kib < 60, 'the shrunken fixture must actually come under budget');
    drifted.manifest.lazy_chunk_budget.local_measurement.kib_gzip = measured.kib;
    drifted.manifest.lazy_chunk_budget.local_measurement.modules = measured.modules;
    assert.throws(() => validatePhase7Exit(drifted), /is recorded OPEN while measuring/);
});

test('an open breach with fewer than two options is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.lazy_chunk_budget.options =
        drifted.manifest.lazy_chunk_budget.options.slice(0, 1);
    assert.throws(() => validatePhase7Exit(drifted), /fewer than two options/);
});

test('an option with no stated consequence is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.lazy_chunk_budget.options[0].consequence = 'do it';
    assert.throws(() => validatePhase7Exit(drifted), /not stated well enough to choose/);
});

test('an open breach with no enforcing gate is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.lazy_chunk_budget.enforced_by_gate = null;
    assert.throws(() => validatePhase7Exit(drifted), /names no enforcing gate/);
});

test('dropping the breach from the exit report is rejected', () => {
    const drifted = input();
    drifted.exitReport = drifted.exitReport.split('78.4').join('60.0');
    assert.throws(() => validatePhase7Exit(drifted), /exit report does not carry the budget breach/);
});

test('dropping the breach from the risk register is rejected', () => {
    const drifted = input();
    drifted.riskRegister = drifted.riskRegister.split('R-P7-B').join('R-P7-Z');
    assert.throws(() => validatePhase7Exit(drifted),
        /risk register does not carry the budget breach/);
});

test('a risk register that records the breach as closed is rejected', () => {
    const drifted = input();
    drifted.riskRegister = mutated(drifted.riskRegister, /\| Open \|/, '| Closed |');
    assert.throws(() => validatePhase7Exit(drifted), /does not record the budget breach as open/);
});

test('the programme risk register may not be renumbered by a phase', () => {
    const drifted = input();
    drifted.riskRegister = mutated(drifted.riskRegister, /^\| R22 \|/m, '| R99 |\n| R22 |');
    assert.throws(() => validatePhase7Exit(drifted), /register inventory changed/);
});

// ── sign-off provenance ─────────────────────────────────────────────────────

test('claiming independent reviewers exist is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.sign_off.independent_reviewers_exist = true;
    assert.throws(() => validatePhase7Exit(drifted), /sign-off provenance drifted/);
});

test('claiming an independent security or privacy review is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.sign_off.independent_security_or_privacy_review_performed = true;
    assert.throws(() => validatePhase7Exit(drifted), /sign-off provenance drifted/);
});

test('upgrading a blanket instruction into a line-by-line reading is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.sign_off.line_by_line_reading = true;
    assert.throws(() => validatePhase7Exit(drifted), /sign-off provenance drifted/);
});

test('reading the authorization as a grant of P7-G5 is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.sign_off.grants_p7_g5 = true;
    assert.throws(() => validatePhase7Exit(drifted), /sign-off provenance drifted/);
});

test('dropping a review role from the covered set is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.sign_off.roles_covered = REVIEW_ROLES.slice(1);
    assert.throws(() => validatePhase7Exit(drifted), /sign-off provenance drifted/);
});

test('an exit report missing a review role is rejected', () => {
    const drifted = input();
    drifted.exitReport = drifted.exitReport.split('Privacy Reviewer').join('Reviewer');
    assert.throws(() => validatePhase7Exit(drifted), /lacks the Privacy Reviewer row/);
});

test('an exit report that stops disclosing the missing security review is rejected', () => {
    const drifted = input();
    // Case-insensitively and everywhere: the disclosure appears as a §9 bullet
    // and again in the sign-off table, and the gate reads it case-insensitively.
    drifted.exitReport = mutated(drifted.exitReport, /no independent security review/gi,
        'security review completed');
    assert.throws(() => validatePhase7Exit(drifted), /stopped disclosing/);
});

// ── P7-G5 is a consequence ──────────────────────────────────────────────────

test('granting P7-G5 with stories outstanding is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.exit_gate_granted = true;
    drifted.manifest.p7_g5.granted = true;
    assert.throws(() => validatePhase7Exit(drifted), /granted or withheld against its own conditions/);
});

test('a condition table with an unstated row is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.p7_g5.conditions[0].state = '';
    assert.throws(() => validatePhase7Exit(drifted), /condition table is missing or unstated/);
});

test('an exit report that stops saying P7-G5 is not granted is rejected', () => {
    const drifted = input();
    drifted.exitReport = drifted.exitReport.split('**NOT GRANTED**').join('pending');
    assert.throws(() => validatePhase7Exit(drifted), /does not say P7-G5 is not granted/);
});

test('authorizing Phase 8 while P7-G5 is withheld is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.decision.phase_8_opening = 'AUTHORIZED';
    assert.throws(() => validatePhase7Exit(drifted), /Phase 8 cannot be authorized/);
});

test('a Phase 8 handoff that reads as controlling while P7-G5 is withheld is rejected', () => {
    const drifted = input();
    drifted.handoff = mutated(drifted.handoff, /^Status: \*\*ISSUED/m, 'Status: **CONTROLLING');
    assert.throws(() => validatePhase7Exit(drifted), /must not read as controlling/);
});

test('a Phase 8 handoff that stops saying P7-G5 is withheld is rejected', () => {
    const drifted = input();
    drifted.handoff = mutated(drifted.handoff, /`P7-G5` is NOT granted/, '`P7-G5` is pending');
    assert.throws(() => validatePhase7Exit(drifted), /must not read as controlling/);
});

test('an open phase with no open items is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.open_items = [];
    assert.throws(() => validatePhase7Exit(drifted), /records no open item/);
});

test('an unowned open item is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.open_items[0].owner = '';
    assert.throws(() => validatePhase7Exit(drifted), /unowned or unstated/);
});

// ── the boundary ────────────────────────────────────────────────────────────

for (const key of ['collaboration_activation', 'production_identity', 'production_d1',
    'production_document_routes']) {
    test(`relaxing ${key} at the exit gate is rejected`, () => {
        const drifted = input();
        drifted.manifest = clone(drifted.manifest);
        drifted.manifest.decision[key] = 'GO';
        assert.throws(() => validatePhase7Exit(drifted), new RegExp(`boundary drifted: ${key}`));
    });
}

test('an exit report that drops the production boundary sentence is rejected', () => {
    const drifted = input();
    // \s+ rather than a space: the sentence is line-wrapped in the report, and a
    // pattern that assumed one space would silently fail to apply.
    drifted.exitReport = mutated(drifted.exitReport,
        /production never\s+activates collaboration/g, 'production is fine');
    assert.throws(() => validatePhase7Exit(drifted), /dropped the boundary that matters/);
});

// ── the record itself ───────────────────────────────────────────────────────

test('a missing exit evidence record is rejected', () => {
    const drifted = input();
    drifted.evidenceSources = { ...drifted.evidenceSources };
    delete drifted.evidenceSources['CF-EV-P7-EXIT-001'];
    assert.throws(() => validatePhase7Exit(drifted), /evidence that was never written|exit evidence record/);
});

test('an exit evidence record without a Story line is rejected', () => {
    const drifted = input();
    drifted.evidenceSources = { ...drifted.evidenceSources };
    drifted.evidenceSources['CF-EV-P7-EXIT-001'] = mutated(
        drifted.evidenceSources['CF-EV-P7-EXIT-001'], /^Story: /m, 'Owner: ');
    assert.throws(() => validatePhase7Exit(drifted), /exit evidence record/);
});

test('the gate states the open defect and the owner decision at run time', () => {
    const check = read('scripts/check-cloudflare-phase-7-exit.mjs');
    assert.match(check, /OWNER DECISION REQUIRED/);
    assert.match(check, /OPEN DEFECT — LAZY CHUNK BUDGET BREACHED/);
    assert.match(check, /PHASE 7 DOES NOT CLOSE/);
});

test('the gate is wired into the release chain', () => {
    const scripts = json('package.json').scripts;
    assert.equal(scripts['cf:phase7:exit:check'],
        'node scripts/check-cloudflare-phase-7-exit.mjs');
    assert.match(scripts['check:cloudflare'], /npm run cf:phase7:exit:check/);
    assert.match(read('scripts/cloudflare-ci-policy.mjs'), /cf:phase7:exit:check/);
});
