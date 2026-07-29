import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7WiringSprint } from '../scripts/cloudflare-phase-7-wiring-sprint-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const source = JSON.parse(read('config/cloudflare/phase-7-wiring-sprint-plan.json'));
const sprintSource = read('docs/collaboration-foundation/phase-7-wiring-sprint.md');
const baselineEvidenceSources = Object.fromEntries(source.tickets
    .filter(ticket => fs.existsSync(path.join(root, ticket.evidence.path)))
    .map(ticket => [ticket.evidence.id, read(ticket.evidence.path)]));
const clone = () => structuredClone(source);
const validate = (plan, evidenceSources = {}) =>
    validatePhase7WiringSprint({
        plan,
        sprintSource,
        evidenceSources: { ...baselineEvidenceSources, ...evidenceSources }
    });

function resetPendingTicket(ticket, status) {
    ticket.status = status;
    ticket.review.status = 'PENDING';
    for (const key of Object.keys(ticket.verification)) {
        ticket.verification[key] = 'NOT_RUN';
    }
    if (ticket.live_qualification.required) {
        ticket.live_qualification.status = 'NOT_RUN';
    }
    ticket.evidence.status = 'PLANNED';
    ticket.delivery = {
        commit: null, pushed: false, pipeline: 'NOT_RUN', preview_smoke: 'NOT_RUN'
    };
    return ticket;
}

function prepareTicketBeforeReview(plan, {
    status = 'IN_PROGRESS',
    verification = 'NOT_RUN'
} = {}) {
    plan.tickets.slice(1).forEach(ticket => resetPendingTicket(ticket, 'BLOCKED'));
    const ticket = resetPendingTicket(plan.tickets[0], status);
    for (const key of Object.keys(ticket.verification)) {
        ticket.verification[key] = verification;
    }
    plan.current_ticket = ticket.id;
    return ticket;
}

function closeTicket(ticket) {
    for (const key of Object.keys(ticket.verification)) ticket.verification[key] = 'PASS';
    ticket.review.status = 'PASS';
    ticket.status = 'PASS';
    ticket.delivery = {
        commit: 'a'.repeat(40), pushed: true, pipeline: 'PASS', preview_smoke: 'PASS'
    };
    if (ticket.live_qualification.required) ticket.live_qualification.status = 'PASS';
    ticket.evidence.status = 'PASS';
    return { [ticket.evidence.id]: `Status: PASS\nTicket: ${ticket.id}\nCommit: ${ticket.delivery.commit}` };
}

test('accepts the initial ordered remediation sprint', () => {
    assert.equal(validate(clone()), true);
});

test('rejects two active tickets or an active successor before predecessor PASS', () => {
    const two = clone();
    prepareTicketBeforeReview(two);
    two.tickets[1].status = 'IN_PROGRESS';
    assert.throws(() => validate(two), /one active|More than|current ticket/i);

    const early = clone();
    prepareTicketBeforeReview(early, { status: 'BLOCKED' });
    early.tickets[1].status = 'READY';
    early.current_ticket = early.tickets[1].id;
    assert.throws(() => validate(early), /blocked|before/i);
});

test('rejects PASS sprint while any ticket remains open', () => {
    const plan = clone();
    plan.status = 'PASS';
    assert.throws(() => validate(plan), /before every ticket closed/);
});

test('rejects ticket PASS out of order', () => {
    const plan = clone();
    prepareTicketBeforeReview(plan);
    const evidence = closeTicket(plan.tickets[2]);
    assert.throws(() => validate(plan, evidence), /before/);
});

test('rejects title and required-test scope drift', () => {
    const title = clone();
    title.tickets[0].title = 'Unrelated work';
    assert.throws(() => validate(title), /title, order, or required-test/);

    const tests = clone();
    tests.tickets[0].required_tests = ['composed_entry', 'browser_action_to_request'];
    assert.throws(() => validate(tests), /required-test/);
});

test('rejects review PASS before every verification layer passes', () => {
    const plan = clone();
    const ticket = prepareTicketBeforeReview(plan, { status: 'REVIEW_PASS' });
    ticket.review.status = 'PASS';
    assert.throws(() => validate(plan), /REVIEW_PASS without review and verification PASS/);
});

test('rejects awaiting review before verification passes', () => {
    const plan = clone();
    prepareTicketBeforeReview(plan, { status: 'AWAITING_REVIEW' });
    assert.throws(() => validate(plan), /awaits review before verification PASS/);
});

test('rejects REVIEW_PASS without an actual passing review', () => {
    const plan = clone();
    prepareTicketBeforeReview(plan, { status: 'REVIEW_PASS', verification: 'PASS' });
    assert.throws(() => validate(plan), /claims REVIEW_PASS/);
});

test('rejects commit, push, pipeline, or smoke before its prerequisite', () => {
    const commit = clone();
    prepareTicketBeforeReview(commit).delivery.commit = 'a'.repeat(40);
    assert.throws(() => validate(commit), /before review PASS/);

    const push = clone();
    prepareTicketBeforeReview(push).delivery.pushed = true;
    assert.throws(() => validate(push), /before review PASS|pushed without/);

    const pipeline = clone();
    prepareTicketBeforeReview(pipeline).delivery.pipeline = 'PASS';
    assert.throws(() => validate(pipeline), /before review PASS|before push/);

    const smoke = clone();
    prepareTicketBeforeReview(smoke).delivery.preview_smoke = 'PASS';
    assert.throws(() => validate(smoke), /before review PASS|before the pipeline/);
});

test('rejects ticket PASS without evidence bound to the commit', () => {
    const plan = clone();
    prepareTicketBeforeReview(plan, { verification: 'PASS' });
    const evidence = closeTicket(plan.tickets[0]);
    plan.tickets[1].status = 'READY';
    plan.current_ticket = plan.tickets[1].id;
    for (const debt of plan.known_action_debt) {
        if (debt.owner === plan.tickets[0].id) debt.status = 'RESOLVED';
    }
    assert.throws(() => validate(plan), /PASS evidence/);
    assert.equal(validate(plan, evidence), true);
});

test('rejects PASS while assigned action debt remains open', () => {
    const plan = clone();
    prepareTicketBeforeReview(plan, { verification: 'PASS' });
    const evidence = closeTicket(plan.tickets[0]);
    plan.tickets[1].status = 'READY';
    plan.current_ticket = plan.tickets[1].id;
    plan.known_action_debt
        .find(debt => debt.owner === plan.tickets[0].id).status = 'OPEN';
    assert.throws(() => validate(plan, evidence), /remains open/);
});

test('rejects action-debt inventory drift', () => {
    const plan = clone();
    plan.known_action_debt.pop();
    assert.throws(() => validate(plan), /action-debt inventory/);
});

test('rejects missing member/provider contract prerequisites', () => {
    const member = clone();
    member.tickets[5].title = 'Wire member clicks';
    assert.throws(() => validate(member), /title/);

    const provider = clone();
    provider.known_state_debt[0].follow_up = 'later';
    assert.throws(() => validate(provider), /missing or vague/);
});

test('rejects workflow, authority, privacy, or independent-review drift', () => {
    const workflow = clone();
    workflow.workflow.closure_commit_must_be_metadata_only = false;
    assert.throws(() => validate(workflow), /closure_commit/);

    const authority = clone();
    authority.authorization.agent_preview_mutation = true;
    assert.throws(() => validate(authority), /remote or Phase 8 authority/);

    const privacy = clone();
    privacy.privacy.personal_vault_storage_untouched = false;
    assert.throws(() => validate(privacy), /Privacy boundary/);

    const review = clone();
    review.tickets[0].review.independent_review = true;
    assert.throws(() => validate(review), /review provenance/);
});
