import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Outbox } from '../scripts/cloudflare-phase-6-outbox-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-6');
const IDS = ['CF-EV-P6-UT-005', 'CF-EV-P6-INT-003', 'CF-EV-P6-E2E-001', 'CF-EV-P6-SEC-006'];

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-6-offline-outbox.json'),
        outboxSource: read('js/collaboration/outbox.js'),
        nodeTestSource: read('tests/outbox.test.mjs'),
        replayTestSource: read('tests/cloudflare/outbox-replay.workers.test.ts'),
        browserTestSource: read('tests/browser-outbox.mjs'),
        packageJson: json('package.json'),
        evidenceSources: Object.fromEntries(IDS
            .map(id => [id, fs.readFileSync(path.join(evidenceDirectory, `${id}.md`), 'utf8')]))
    };
}

test('CF-P6-006 delivers the encrypted offline outbox and proves G6', () => {
    assert.equal(validatePhase6Outbox(actualInput()), true);
});

test('CF-P6-006 rejects plaintext, retry, quarantine, and evidence drift', () => {
    for (const mutate of [
        input => { input.manifest.status = 'PENDING'; },
        input => { input.manifest.next_gate = 'P6-G4'; },
        input => { input.manifest.authorizes_on_approval = 'CF-P6-008'; },
        input => { input.manifest.states = ['queued']; },
        // Plaintext must be structurally impossible.
        input => { input.manifest.storage.payload_accepts_only_bytes = false; },
        input => { input.manifest.storage.draft_accepts_only_bytes = false; },
        input => { input.manifest.storage.plaintext_fields = 1; },
        input => { input.manifest.storage.namespace_components = ['environment']; },
        input => { input.outboxSource = input.outboxSource.replaceAll('instanceof Uint8Array', '!== null'); },
        input => { input.outboxSource = input.outboxSource.replaceAll('INVALID_PAYLOAD', 'OK'); },
        // Retry policy.
        input => { input.manifest.retry.reuses_original_mutation_id = false; },
        input => { input.manifest.retry.backoff = 'fixed'; },
        input => { input.manifest.retry.ceiling_ms = 86_400_000; },
        input => { input.manifest.retry.max_attempts = 1000; },
        input => { input.manifest.retry.non_retryable_statuses = [401, 403]; },
        input => { input.manifest.retry.non_retryable_statuses = [401, 403, 409]; },
        input => { input.manifest.retry.non_retryable_codes = ['VALIDATION_FAILED']; },
        input => { input.outboxSource = input.outboxSource.replaceAll('MAX_BACKOFF_MS', 'NO_CAP'); },
        // Ordering.
        input => { input.manifest.ordering.per_document_fifo = false; },
        input => { input.manifest.ordering.declared_predecessor = false; },
        input => { input.manifest.ordering.inflight_blocks_same_document = false; },
        input => { input.outboxSource = input.outboxSource.replaceAll('predecessorId', 'ignored'); },
        // Quota.
        input => { input.manifest.quota.max_pending_entries = 100000; },
        input => { input.manifest.quota.max_bytes = 1; },
        input => { input.manifest.quota.warn_at_percent = 100; },
        input => { input.manifest.quota.refusal_preserves_queued_work = false; },
        // Nothing may be silently destroyed.
        input => { input.manifest.expiry.behavior = 'delete'; },
        input => { input.manifest.expiry.days = 90; },
        input => { input.manifest.expiry.draft_preserved = false; },
        input => { input.manifest.quarantine_reasons = ['logout']; },
        input => { input.manifest.disposal.requires_recorded_result = false; },
        input => { input.manifest.disposal.silent_delete = true; },
        input => { input.manifest.disposal.forensic_erasure_claimed = true; },
        input => { input.outboxSource = input.outboxSource.replaceAll('RESULT_NOT_RECORDED', 'OK'); },
        // Queued work is never standing permission.
        input => { input.manifest.authority.queued_entry_is_permission = true; },
        input => { input.manifest.authority.reauthorized_on_submission = false; },
        input => { input.manifest.authority.quarantined_entry_claimable = true; },
        input => { input.manifest.authority.reauthentication_alone_restores = true; },
        // G6 must stay proven against real D1.
        input => { input.manifest.sprint_gate_scenarios_addressed = []; },
        input => { input.manifest.sprint_gate_scenarios_addressed[0].id = 'G1'; },
        input => { input.manifest.sprint_gate_scenarios_addressed[0].proof = 'works fine'; },
        input => { input.replayTestSource = input.replayTestSource.replaceAll('G6:', 'x:'); },
        input => { input.replayTestSource = input.replayTestSource.replaceAll('executeDocumentMutation', 'fakeSubmit'); },
        input => { input.replayTestSource = input.replayTestSource.replaceAll('replayed', 'ignored'); },
        // A found defect must be recorded as fixed.
        input => { input.manifest.defect_found_and_fixed.accepted_as_known_issue = true; },
        input => { delete input.manifest.defect_found_and_fixed.resolution; },
        // Browser evidence.
        input => { input.manifest.browser_matrix = ['chromium']; },
        input => { input.manifest.browser_evidence.real_indexeddb = false; },
        input => { input.manifest.browser_evidence.survives_page_reload = false; },
        input => { input.manifest.browser_evidence.console_errors = 2; },
        input => { input.manifest.browser_evidence.registered_in_e2e = false; },
        input => { input.browserTestSource = input.browserTestSource.replaceAll('page.reload', 'noop'); },
        input => { input.packageJson.scripts['test:e2e'] = 'node tests/browser-smoke.mjs'; },
        input => { input.nodeTestSource = input.nodeTestSource.replaceAll('namespaces are isolated', 'x'); },
        // Tests, evidence, boundary.
        input => { input.manifest.tests.skips = 1; },
        input => { input.manifest.tests.browser_engines = 1; },
        input => { delete input.evidenceSources['CF-EV-P6-E2E-001']; },
        input => { input.evidenceSources['CF-EV-P6-SEC-006'] = '# CF-EV-P6-SEC-006 x\n\nStatus: PENDING\n\nCF-P6-006\n'; },
        input => { input.manifest.authorization_boundary.routes_registered = 1; },
        input => { input.manifest.authorization_boundary.personal_vault_diff_lines = 2; },
        input => { input.manifest.authorization_boundary.collaboration_activation = 'GO'; }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase6Outbox(input), Error);
    }
});
