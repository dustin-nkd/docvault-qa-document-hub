// Drift tests for the CF-P7-011 gate. Each case mutates one thing and asserts
// the policy rejects it, so the gate is known to bite.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7Audit, code, FORBIDDEN_FIELDS }
    from '../scripts/cloudflare-phase-7-audit-policy.mjs';
import {
    AUDIT_VIEW_FIELDS, auditAccessDecision, projectAuditEvent, narrowFilters, auditActivityModel
} from '../js/collaboration/audit-activity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const clone = value => JSON.parse(JSON.stringify(value));

const sampleEvent = {
    eventId: '66666666-6666-4666-8666-666666666666',
    workspaceId: '55555555-5555-4555-8555-555555555555',
    schemaVersion: 1, eventType: 'membership.role.changed',
    occurredAt: 1780000000000, order: 7,
    requestId: '11111111-1111-4111-8111-111111111111', outcome: 'success'
};

const input = () => ({
    manifest: json('config/cloudflare/phase-7-audit-activity.json'),
    contract: json('config/cloudflare/phase-7-ui-contract.json'),
    journeySource: read('js/collaboration/audit-activity.js'),
    styleSource: read('style.css'),
    indexHtml: read('index.html'),
    serviceWorker: read('sw.js'),
    apiContract: read('docs/collaboration-foundation/api-contract.md'),
    unitTestSource: read('tests/collaboration-audit-activity.test.mjs'),
    journeyExports: {
        AUDIT_VIEW_FIELDS: [...AUDIT_VIEW_FIELDS], auditAccessDecision, projectAuditEvent,
        narrowFilters, auditActivityModel, sampleEvent
    }
});

test('the policy accepts the repository as it stands', () => {
    assert.equal(validatePhase7Audit(input()), true);
});

// ── the allow-list ───────────────────────────────────────────────────────────

test('a rendered field set that drifts from the contract is rejected', () => {
    const drifted = input();
    drifted.journeyExports.AUDIT_VIEW_FIELDS = [...AUDIT_VIEW_FIELDS, 'documentTitle'];
    assert.throws(() => validatePhase7Audit(drifted), /drifted from the frozen AuditEventView/);
});

test('a projection that trims instead of refusing is rejected', () => {
    const drifted = input();
    drifted.journeyExports.projectAuditEvent = event => {
        const kept = {};
        for (const key of AUDIT_VIEW_FIELDS) if (event[key] !== undefined) kept[key] = event[key];
        return kept;
    };
    assert.throws(() => validatePhase7Audit(drifted), /is no longer refused/);
});

test('every forbidden field is individually rejected', () => {
    for (const field of FORBIDDEN_FIELDS) {
        const drifted = input();
        drifted.journeyExports.projectAuditEvent = event => {
            if (field in event) return { ...sampleEvent };
            return projectAuditEvent(event);
        };
        assert.throws(() => validatePhase7Audit(drifted),
            new RegExp(`carrying ${field} is no longer refused`), field);
    }
});

test('claiming an unexpected field may be dropped silently is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.allow_list.unexpected_field_silently_dropped = true;
    assert.throws(() => validatePhase7Audit(drifted), /dropped silently/);
});

test('a contract that no longer declares the allow-list is rejected', () => {
    const drifted = input();
    drifted.apiContract = drifted.apiContract
        .replace('`AuditEventView` contains only:', 'AuditEventView is flexible:');
    assert.throws(() => validatePhase7Audit(drifted), /no longer declares/);
});

// ── the filters ──────────────────────────────────────────────────────────────

test('a content query is rejected', () => {
    const drifted = input();
    drifted.journeyExports.narrowFilters = filters => ({ ...filters });
    assert.throws(() => validatePhase7Audit(drifted), /Filter q is no longer refused/);
});

test('claiming a content query is supported is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.filters.content_query_supported = true;
    assert.throws(() => validatePhase7Audit(drifted), /content query over the audit log/);
});

test('adding a fourth filter is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.filters.supported = ['eventType', 'occurredFrom', 'occurredTo', 'actorUserId'];
    assert.throws(() => validatePhase7Audit(drifted), /audit filter set drifted/);
});

// ── authority ────────────────────────────────────────────────────────────────

test('letting an editor read the log is rejected', () => {
    const drifted = input();
    drifted.journeyExports.auditAccessDecision = () => ({ allowed: true, reason: null });
    assert.throws(() => validatePhase7Audit(drifted), /may now read the audit log/);
});

test('a denial with no reason is rejected', () => {
    const drifted = input();
    drifted.journeyExports.auditAccessDecision = () => ({ allowed: false, reason: 'no' });
    assert.throws(() => validatePhase7Audit(drifted), /denied without a reason/);
});

test('handing events to a denied role is rejected', () => {
    const drifted = input();
    drifted.journeyExports.auditActivityModel = args => ({
        ...auditActivityModel(args), events: [sampleEvent]
    });
    assert.throws(() => validatePhase7Audit(drifted), /now receives audit events/);
});

test('letting a denied role paginate is rejected', () => {
    const drifted = input();
    drifted.journeyExports.auditActivityModel = args => ({
        ...auditActivityModel(args), events: [], canPaginate: true
    });
    assert.throws(() => validatePhase7Audit(drifted), /may now paginate/);
});

test('hiding the restricted surface is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authority.restricted_surface_hidden = true;
    assert.throws(() => validatePhase7Audit(drifted), /hidden instead of explained/);
});

test('claiming the client enforces authorization is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authority.enforced_here = true;
    assert.throws(() => validatePhase7Audit(drifted), /claims to enforce authorization/);
});

// ── presentation, isolation, bookkeeping ─────────────────────────────────────

test('removing the outcome shape is rejected', () => {
    const drifted = input();
    drifted.styleSource = drifted.styleSource.replace(/collab-audit__shape--/g, 'x-');
    assert.throws(() => validatePhase7Audit(drifted), /colour as the only signal/);
});

test('unscoped reason ids are rejected', () => {
    const drifted = input();
    drifted.journeySource = drifted.journeySource.replace(/\$\{instanceId\}-/g, 'fixed-');
    assert.throws(() => validatePhase7Audit(drifted), /no longer scoped/);
});

test('rendering through innerHTML is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nrow.innerHTML = event.eventType;\n';
    assert.throws(() => validatePhase7Audit(drifted), /innerHTML/);
});

test('performing transport in the module is rejected', () => {
    const drifted = input();
    drifted.journeySource += '\nconst response = fetch("/api/v1/audit-events");\n';
    assert.throws(() => validatePhase7Audit(drifted), /own transport/);
});

test('a manifest that authorizes the wrong next story is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.authorizes_on_approval = 'CF-P7-014';
    assert.throws(() => validatePhase7Audit(drifted), /Unsupported Phase 7/);
});

test('a unit test inventory that disagrees with the suite is rejected', () => {
    const drifted = input();
    drifted.manifest = clone(drifted.manifest);
    drifted.manifest.tests.unit_count += 1;
    assert.throws(() => validatePhase7Audit(drifted), /Unit test inventory drifted/);
});

test('documenting a prohibition passes; performing it fails', () => {
    const documented = input();
    documented.journeySource += '\n// this module never calls fetch( directly\n';
    assert.equal(validatePhase7Audit(documented), true);
    assert.equal(code('const a = 1; // fetch(x)').includes('fetch(x)'), false);
});
