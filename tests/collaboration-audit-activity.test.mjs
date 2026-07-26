// CF-P7-011 — audit activity.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    AUDIT_VIEW_FIELDS, AUDIT_FILTERS, AuditActivityError, auditAccessDecision,
    projectAuditEvent, narrowFilters, auditActivityModel, renderAuditActivity, readAuditEvents
} from '../js/collaboration/audit-activity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const WORKSPACE = '55555555-5555-4555-8555-555555555555';
const EVENT = '66666666-6666-4666-8666-666666666666';

function element(tagName) {
    const node = {
        tagName, children: [], attributes: new Map(), className: '', textContent: '',
        type: '', id: '', disabled: false,
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        appendChild(child) { this.children.push(child); return child; },
        querySelector(selector) { return descendants(this).find(matches(selector)) ?? null; },
        querySelectorAll(selector) { return descendants(this).filter(matches(selector)); }
    };
    return node;
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const matches = selector => node => {
    if (selector.startsWith('.')) return node.className.split(' ').includes(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) {
        const value = node.getAttribute(attribute[1]);
        return attribute[2] === undefined ? value !== null : value === attribute[2];
    }
    return node.tagName === selector;
};
const doc = { createElement: element };

const event = (overrides = {}) => ({
    eventId: EVENT, workspaceId: WORKSPACE, schemaVersion: 1,
    eventType: 'membership.role.changed', occurredAt: 1780000000000, order: 7,
    requestId: '11111111-1111-4111-8111-111111111111', outcome: 'success', ...overrides
});

// ── who may read ─────────────────────────────────────────────────────────────

test('an owner and an admin may read the log', () => {
    for (const actorRole of ['owner', 'admin']) {
        assert.equal(auditAccessDecision({ actorRole }).allowed, true, actorRole);
    }
});

test('an editor and a viewer may not, and are told why', () => {
    for (const actorRole of ['editor', 'viewer']) {
        const decision = auditAccessDecision({ actorRole });
        assert.equal(decision.allowed, false, actorRole);
        assert.match(decision.reason, /Only an owner or admin/);
    }
});

test('the surface is still rendered for a role that may not read it', () => {
    const node = renderAuditActivity(doc,
        auditActivityModel({ actorRole: 'viewer', events: [] }), 'audit');
    assert.notEqual(node, null);
    assert.match(node.querySelector('.collab-audit__reason').textContent, /owner or admin/);
});

test('no events are exposed to a role that may not read them', () => {
    const model = auditActivityModel({ actorRole: 'viewer', events: [event()] });
    assert.deepEqual([...model.events], []);
});

// ── the allow-list ───────────────────────────────────────────────────────────

test('carries exactly the seventeen frozen fields', () => {
    assert.equal(AUDIT_VIEW_FIELDS.length, 17);
    for (const field of ['eventId', 'eventType', 'outcome', 'linkedEventId']) {
        assert.ok(AUDIT_VIEW_FIELDS.includes(field), field);
    }
});

test('keeps every allow-listed field that is present', () => {
    const projected = projectAuditEvent(event({ reasonCode: 'ROLE_CEILING', targetType: 'user' }));
    assert.equal(projected.reasonCode, 'ROLE_CEILING');
    assert.equal(projected.targetType, 'user');
    assert.equal(projected.eventType, 'membership.role.changed');
});

test('refuses an event carrying a field nobody expected', () => {
    for (const extra of ['freeText', 'ciphertext', 'token', 'stack', 'sql', 'note']) {
        assert.throws(() => projectAuditEvent(event({ [extra]: 'x' })),
            error => error instanceof AuditActivityError
                && error.code === 'UNEXPECTED_AUDIT_FIELD', extra);
    }
});

test('a refusal is louder than a silent drop', () => {
    // The point of the refusal: an unexpected field never reaches the DOM, and
    // never passes unnoticed either.
    assert.throws(() => projectAuditEvent(event({ documentTitle: 'Quarterly plan' })),
        error => error.code === 'UNEXPECTED_AUDIT_FIELD');
});

test('refuses an event missing the fields that identify it', () => {
    assert.throws(() => projectAuditEvent(event({ eventId: 'nope' })),
        error => error.code === 'INVALID_AUDIT_EVENT');
    assert.throws(() => projectAuditEvent({ ...event(), outcome: '' }),
        error => error.code === 'INVALID_AUDIT_EVENT');
});

// ── the filters ──────────────────────────────────────────────────────────────

test('accepts exactly the three frozen filters', () => {
    assert.deepEqual([...AUDIT_FILTERS], ['eventType', 'occurredFrom', 'occurredTo']);
    const narrowed = narrowFilters({ eventType: 'device.registered', occurredFrom: 1 });
    assert.deepEqual({ ...narrowed }, { eventType: 'device.registered', occurredFrom: 1 });
});

test('refuses a content query outright', () => {
    for (const key of ['q', 'search', 'text', 'contains', 'documentId']) {
        assert.throws(() => narrowFilters({ [key]: 'secret' }),
            error => error.code === 'UNSUPPORTED_FILTER', key);
    }
});

// ── the model ────────────────────────────────────────────────────────────────

test('an empty log is empty, not broken', () => {
    const model = auditActivityModel({ actorRole: 'owner', events: [] });
    assert.equal(model.isEmpty, true);
    assert.equal(model.canPaginate, false);
});

test('paginates only when the server handed back a cursor', () => {
    assert.equal(auditActivityModel({
        actorRole: 'owner', events: [event()], nextCursor: 'opaque'
    }).canPaginate, true);
    assert.equal(auditActivityModel({
        actorRole: 'owner', events: [event()], nextCursor: null
    }).canPaginate, false);
});

test('never lets a role that cannot read paginate', () => {
    assert.equal(auditActivityModel({
        actorRole: 'viewer', events: [], nextCursor: 'opaque'
    }).canPaginate, false);
});

// ── the rendered surface ─────────────────────────────────────────────────────

test('exposes event type and outcome as data, not colour', () => {
    const node = renderAuditActivity(doc,
        auditActivityModel({ actorRole: 'owner', events: [event()] }), 'audit');
    const row = node.querySelector('[data-event-type]');
    assert.equal(row.getAttribute('data-event-type'), 'membership.role.changed');
    assert.equal(row.getAttribute('data-outcome'), 'success');
    assert.notEqual(node.querySelector('.collab-audit__shape'), null);
});

test('renders a machine-readable time', () => {
    const node = renderAuditActivity(doc,
        auditActivityModel({ actorRole: 'owner', events: [event()] }), 'audit');
    const when = node.querySelector('.collab-audit__when');
    assert.equal(when.tagName, 'time');
    assert.equal(when.getAttribute('datetime'), '1780000000000');
});

test('keeps the paginate control visible and explained when it cannot be used', () => {
    const node = renderAuditActivity(doc,
        auditActivityModel({ actorRole: 'viewer', events: [] }), 'audit');
    const more = node.querySelector('[data-collab-action="paginate"]');
    assert.notEqual(more, null, 'the control was hidden instead of explained');
    assert.equal(more.disabled, true);
    assert.equal(more.getAttribute('aria-disabled'), 'true');
    const id = more.getAttribute('aria-describedby');
    assert.ok(node.querySelectorAll('.collab-audit__reason').some(item => item.id === id));
});

test('explains an exhausted log differently from a denied one', () => {
    const node = renderAuditActivity(doc,
        auditActivityModel({ actorRole: 'owner', events: [event()] }), 'audit');
    assert.match(node.querySelector('[data-collab-action="paginate"]').getAttribute('title'),
        /no older activity/);
});

test('scopes its ids to the rendered instance', () => {
    const model = auditActivityModel({ actorRole: 'viewer', events: [] });
    const id = panel => renderAuditActivity(doc, model, panel)
        .querySelector('.collab-audit__reason').id;
    assert.notEqual(id('a'), id('b'));
});

test('builds every node through the document, never through innerHTML', () => {
    assert.equal(/\.innerHTML/.test(read('js/collaboration/audit-activity.js')), false);
});

// ── reading through the service ──────────────────────────────────────────────

test('carries the opaque cursor and narrows the filters', async () => {
    const seen = [];
    const api = { async listAuditEvents(input) { seen.push(input);
        return { items: [event()], nextCursor: 'opaque-2' }; } };
    const page = await readAuditEvents({
        api, workspaceId: WORKSPACE, cursor: 'opaque-1',
        filters: { eventType: 'device.registered' }
    });
    assert.equal(seen[0].cursor, 'opaque-1');
    assert.deepEqual({ ...seen[0].filters }, { eventType: 'device.registered' });
    assert.equal(page.nextCursor, 'opaque-2');
});

test('refuses a page carrying an event outside the allow-list', async () => {
    const api = { async listAuditEvents() {
        return { items: [{ ...event(), documentTitle: 'Quarterly plan' }] }; } };
    await assert.rejects(readAuditEvents({ api, workspaceId: WORKSPACE }),
        error => error.code === 'UNEXPECTED_AUDIT_FIELD');
});

test('refuses a page that is not one', async () => {
    const api = { async listAuditEvents() { return { items: 'nope' }; } };
    await assert.rejects(readAuditEvents({ api, workspaceId: WORKSPACE }),
        error => error.code === 'AUDIT_PAGE_INVALID');
});

test('will not send an unsupported filter to the service', async () => {
    const api = { async listAuditEvents() { throw new Error('should not be called'); } };
    await assert.rejects(readAuditEvents({
        api, workspaceId: WORKSPACE, filters: { search: 'secret' }
    }), error => error.code === 'UNSUPPORTED_FILTER');
});
