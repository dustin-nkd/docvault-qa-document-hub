// CF-P7-010 — the conflict resolution dialog, and gate UX U4.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    ConflictDialogError, conflictDialogModel, dismissDialog, chooseResolution,
    requestAutomaticMerge, renderConflictDialog, focusDialog, restoreFocus
} from '../js/collaboration/conflict-dialog.js';
import { RESOLUTION_OPTIONS, openConflict } from '../js/collaboration/conflict-resolution.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const CONFLICT = '77777777-7777-4777-8777-777777777777';
const DOCUMENT = '88888888-8888-4888-8888-888888888888';
const NEW_DOCUMENT = '99999999-9999-4999-8999-999999999999';

function element(tagName) {
    const node = {
        tagName, children: [], attributes: new Map(), className: '', textContent: '',
        type: '', id: '', disabled: false, focused: false,
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        appendChild(child) { this.children.push(child); return child; },
        focus() { this.focused = true; },
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

const conflict = () => openConflict({
    conflictId: CONFLICT, documentId: DOCUMENT, submittedBaseRevision: 3, currentRevision: 5,
    draft: new Uint8Array([1, 2, 3]), now: 1
});

// ── U4: the draft survives everything except an explicit confirmed choice ────

test('dismissing the dialog resolves nothing and keeps the draft', () => {
    const outcome = dismissDialog(conflict());
    assert.equal(outcome.resolved, false);
    assert.equal(outcome.draftRetained, true);
    assert.equal(outcome.state, 'unresolved');
});

test('the three non-destructive resolutions all keep the draft', () => {
    for (const option of ['review-latest', 'reapply-to-latest', 'save-as-separate-copy']) {
        const result = chooseResolution({
            conflict: conflict(), option, draftHeld: true,
            newDocumentId: NEW_DOCUMENT, clientMutationId: NEW_DOCUMENT
        });
        assert.notEqual(result, undefined, option);
    }
});

test('a discard needs arming and confirming, two separate acts', () => {
    assert.throws(() => chooseResolution({
        conflict: conflict(), option: 'discard-with-confirmation', draftHeld: true
    }), error => error instanceof ConflictDialogError && error.code === 'DISCARD_NOT_ARMED');

    assert.throws(() => chooseResolution({
        conflict: conflict(), option: 'discard-with-confirmation', draftHeld: true, armed: true
    }), error => error.code === 'DISCARD_NOT_CONFIRMED');
});

test('an armed and confirmed discard is the only path that drops a draft', () => {
    const result = chooseResolution({
        conflict: conflict(), option: 'discard-with-confirmation',
        draftHeld: true, armed: true, confirmed: true
    });
    assert.equal(result.state, 'discarded');
});

test('a discard is refused when no draft is held to discard', () => {
    assert.throws(() => chooseResolution({
        conflict: conflict(), option: 'discard-with-confirmation',
        draftHeld: false, armed: true, confirmed: true
    }), error => error.code === 'NO_DRAFT_TO_DISCARD');
});

test('no automatic merge is offered, and asking for one is refused', () => {
    assert.equal(conflictDialogModel({ conflict: conflict(), draftHeld: true })
        .automaticMergeOffered, false);
    assert.throws(() => requestAutomaticMerge(),
        error => error.code === 'AUTOMATIC_MERGE_PROHIBITED');
});

test('draft survival is delegated to the outbox, not reimplemented here', () => {
    const source = read('js/collaboration/conflict-dialog.js');
    for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'caches.']) {
        assert.equal(source.includes(forbidden), false,
            `the dialog opened a second persistence path via ${forbidden}`);
    }
});

// ── the four frozen resolutions ──────────────────────────────────────────────

test('offers exactly the four frozen resolutions', () => {
    const model = conflictDialogModel({ conflict: conflict(), draftHeld: true });
    assert.deepEqual(model.options.map(item => item.option), [...RESOLUTION_OPTIONS]);
});

test('exactly one resolution is destructive', () => {
    const model = conflictDialogModel({ conflict: conflict(), draftHeld: true });
    const destructive = model.options.filter(item => item.destroys);
    assert.equal(destructive.length, 1);
    assert.equal(destructive[0].option, 'discard-with-confirmation');
    assert.equal(destructive[0].requiresConfirmation, true);
});

test('every resolution states its consequence before it is chosen', () => {
    for (const item of conflictDialogModel({ conflict: conflict(), draftHeld: true }).options) {
        assert.ok(item.consequence.length > 30, `${item.option} does not say what it does`);
    }
});

test('the discard consequence says it cannot be undone', () => {
    const model = conflictDialogModel({ conflict: conflict(), draftHeld: true });
    const discard = model.options.find(item => item.destroys);
    assert.match(discard.consequence, /cannot be\s+undone/);
});

test('the reapply consequence says nothing is merged for you', () => {
    const model = conflictDialogModel({ conflict: conflict(), draftHeld: true });
    const reapply = model.options.find(item => item.option === 'reapply-to-latest');
    assert.match(reapply.consequence, /Nothing is merged for you/);
});

test('withholds the destructive option when no draft is held', () => {
    const model = conflictDialogModel({ conflict: conflict(), draftHeld: false });
    const discard = model.options.find(item => item.destroys);
    assert.equal(discard.available, false);
    for (const item of model.options.filter(other => !other.destroys)) {
        assert.equal(item.available, true, item.option);
    }
});

test('rejects a conflict or resolution outside the frozen sets', () => {
    assert.throws(() => conflictDialogModel({ conflict: { state: 'stuck' }, draftHeld: true }),
        error => error.code === 'INVALID_CONFLICT');
    assert.throws(() => chooseResolution({
        conflict: conflict(), option: 'merge-them', draftHeld: true
    }), error => error.code === 'UNKNOWN_RESOLUTION');
});

// ── the rendered dialog ──────────────────────────────────────────────────────

test('renders as a labelled modal dialog', () => {
    const node = renderConflictDialog(doc,
        conflictDialogModel({ conflict: conflict(), draftHeld: true }), 'c1');
    assert.equal(node.getAttribute('role'), 'dialog');
    assert.equal(node.getAttribute('aria-modal'), 'true');
    assert.equal(node.getAttribute('aria-labelledby'), 'c1-conflict-title');
    assert.equal(node.querySelector('.collab-conflict__title').id, 'c1-conflict-title');
});

test('states that the draft is safe before any choice is offered', () => {
    const node = renderConflictDialog(doc,
        conflictDialogModel({ conflict: conflict(), draftHeld: true }), 'c1');
    const safety = node.querySelector('.collab-conflict__safety');
    assert.equal(safety.getAttribute('data-draft-held'), 'true');
    assert.match(safety.textContent, /reloading will not lose it/);
});

test('names both revisions so the conflict is legible', () => {
    const node = renderConflictDialog(doc,
        conflictDialogModel({ conflict: conflict(), draftHeld: true }), 'c1');
    assert.match(node.querySelector('.collab-conflict__revisions').textContent,
        /revision 3;.*revision 5/);
});

test('each choice is described by its consequence', () => {
    const node = renderConflictDialog(doc,
        conflictDialogModel({ conflict: conflict(), draftHeld: true }), 'c1');
    for (const option of RESOLUTION_OPTIONS) {
        const button = node.querySelector(`[data-collab-action="${option}"]`);
        const id = button.getAttribute('aria-describedby');
        assert.equal(id, `c1-consequence-${option}`, option);
        assert.ok(node.querySelectorAll('.collab-conflict__consequence')
            .some(item => item.id === id), option);
    }
});

test('marks the destructive option as destructive in the DOM', () => {
    const node = renderConflictDialog(doc,
        conflictDialogModel({ conflict: conflict(), draftHeld: true }), 'c1');
    const rows = node.querySelectorAll('[data-destructive]');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].getAttribute('data-resolution'), 'discard-with-confirmation');
});

test('an armed discard shows a way back to keeping the draft', () => {
    const node = renderConflictDialog(doc,
        conflictDialogModel({ conflict: conflict(), draftHeld: true, discardArmed: true }), 'c1');
    assert.notEqual(node.querySelector('[data-collab-action="cancel-discard"]'), null);
    assert.match(node.querySelector('.collab-conflict__choose--discard-with-confirmation')
        .textContent, /Yes, discard/);
});

test('disables the discard, with a reason, when no draft is held', () => {
    const node = renderConflictDialog(doc,
        conflictDialogModel({ conflict: conflict(), draftHeld: false }), 'c1');
    const discard = node.querySelector('[data-collab-action="discard-with-confirmation"]');
    assert.equal(discard.disabled, true);
    assert.equal(discard.getAttribute('aria-disabled'), 'true');
    assert.ok(discard.getAttribute('title').length > 10);
});

test('always offers a way to close without deciding', () => {
    const node = renderConflictDialog(doc,
        conflictDialogModel({ conflict: conflict(), draftHeld: true }), 'c1');
    assert.notEqual(node.querySelector('[data-collab-action="dismiss-conflict"]'), null);
});

test('scopes its ids to the rendered instance', () => {
    const model = conflictDialogModel({ conflict: conflict(), draftHeld: true });
    const first = renderConflictDialog(doc, model, 'c1')
        .querySelectorAll('.collab-conflict__consequence').map(item => item.id);
    const second = renderConflictDialog(doc, model, 'c2')
        .querySelectorAll('.collab-conflict__consequence').map(item => item.id);
    assert.equal(first.some(id => second.includes(id)), false);
});

test('builds every node through the document, never through innerHTML', () => {
    assert.equal(/\.innerHTML/.test(read('js/collaboration/conflict-dialog.js')), false);
});

// ── focus ────────────────────────────────────────────────────────────────────

test('moves focus into the dialog on open and restores it on close', () => {
    const opener = element('button');
    const node = renderConflictDialog(doc,
        conflictDialogModel({ conflict: conflict(), draftHeld: true }), 'c1');
    const handle = focusDialog({ root: node, previouslyFocused: opener });
    assert.equal(node.querySelector('.collab-conflict__choose').focused, true);
    assert.equal(opener.focused, false);
    assert.equal(restoreFocus(handle), true);
    assert.equal(opener.focused, true);
});

test('survives a close with nothing to restore focus to', () => {
    const node = renderConflictDialog(doc,
        conflictDialogModel({ conflict: conflict(), draftHeld: true }), 'c1');
    assert.equal(restoreFocus(focusDialog({ root: node })), false);
});

test('does not trap focus', () => {
    const source = read('js/collaboration/conflict-dialog.js');
    assert.equal(/keydown|Tab/.test(source), false,
        'a key handler here would be the beginning of a focus trap');
});
