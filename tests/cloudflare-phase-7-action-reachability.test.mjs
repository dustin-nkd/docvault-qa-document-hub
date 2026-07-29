import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePhase7ActionReachability }
    from '../scripts/cloudflare-phase-7-action-reachability-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const planSource = JSON.parse(read('config/cloudflare/phase-7-wiring-sprint-plan.json'));
const collaborationDirectory = path.join(root, 'js', 'collaboration');
const sourceFiles = fs.readdirSync(collaborationDirectory).filter(file => file.endsWith('.js'));
const sources = () => Object.fromEntries(sourceFiles
    .map(file => [file, fs.readFileSync(path.join(collaborationDirectory, file), 'utf8')]));
const clone = value => structuredClone(value);

test('the composed Collaboration action inventory is fully handled or debt-owned', () => {
    assert.equal(validatePhase7ActionReachability({ plan: clone(planSource), sources: sources() }), true);
});

test('a new literal action without a handler or debt owner is rejected', () => {
    const drifted = sources();
    drifted['member-list.js'] +=
        "\nbutton.setAttribute('data-collab-action', 'unowned-destructive-action');\n";
    assert.throws(() => validatePhase7ActionReachability({
        plan: clone(planSource), sources: drifted
    }), /added, removed, or left unowned/);
});

test('a new dynamic action setter cannot bypass the exact inventory', () => {
    const drifted = sources();
    drifted['member-list.js'] +=
        "\nbutton.setAttribute('data-collab-action', pluginAction);\n";
    assert.throws(() => validatePhase7ActionReachability({
        plan: clone(planSource), sources: drifted
    }), /dynamic Collaboration action setter/);
});

test('the current-device action must stay isolated by action name and surface', () => {
    const ambiguous = sources();
    ambiguous['entry.js'] = ambiguous['entry.js']
        .replace("action === 'revoke-this-device'", "action === 'revoke-device'");
    assert.throws(() => validatePhase7ActionReachability({
        plan: clone(planSource), sources: ambiguous
    }), /not isolated/);

    const unscoped = sources();
    unscoped['entry.js'] = unscoped['entry.js']
        .replace("control.closest('[data-collab-surface]')", 'null');
    assert.throws(() => validatePhase7ActionReachability({
        plan: clone(planSource), sources: unscoped
    }), /not surface-aware/);
});

test('the collision cannot remain open after the two revocation actions are separated', () => {
    const plan = clone(planSource);
    plan.known_action_debt
        .find(item => item.key === 'member-device:dispatch-collision').status = 'OPEN';
    assert.throws(() => validatePhase7ActionReachability({
        plan, sources: sources()
    }), /not resolved by CF-P7R-001/);
});

test('the invitation copy debt cannot remain open after clipboard dispatch is wired', () => {
    const plan = clone(planSource);
    plan.known_action_debt
        .find(item => item.key === 'invitation-manage:copy-acceptance-link').status = 'OPEN';
    assert.throws(() => validatePhase7ActionReachability({
        plan, sources: sources()
    }), /not resolved by CF-P7R-002/);
});

test('the invitation revoke debt cannot remain open after row dispatch is wired', () => {
    const plan = clone(planSource);
    plan.known_action_debt
        .find(item => item.key === 'invitation-manage:revoke-invitation').status = 'OPEN';
    assert.throws(() => validatePhase7ActionReachability({
        plan, sources: sources()
    }), /not resolved by CF-P7R-003/);
});

test('the invitation copy action must stay scoped and use the injected clipboard boundary', () => {
    const directClipboard = sources();
    directClipboard['entry.js'] = directClipboard['entry.js']
        .replace('copyAcceptanceUrl({ clipboard, held })',
            'copyAcceptanceUrl({ clipboard: navigator.clipboard, held })');
    assert.throws(() => validatePhase7ActionReachability({
        plan: clone(planSource), sources: directClipboard
    }), /not wired through its scoped clipboard boundary/);

    const unscoped = sources();
    unscoped['entry.js'] = unscoped['entry.js']
        .replaceAll("control.closest('[data-collab-surface=\"invitation-manage\"]')", 'null');
    assert.throws(() => validatePhase7ActionReachability({
        plan: clone(planSource), sources: unscoped
    }), /not wired through its scoped clipboard boundary/);
});

test('invitation revoke must stay scoped to its row and keep the duplicate guard', () => {
    const unscoped = sources();
    unscoped['entry.js'] = unscoped['entry.js']
        .replace("control.closest('[data-invitation-id]')", 'null');
    assert.throws(() => validatePhase7ActionReachability({
        plan: clone(planSource), sources: unscoped
    }), /not scoped to its row or guarded/);

    const unguarded = sources();
    unguarded['entry.js'] = unguarded['entry.js']
        .replace('if (invitationRevokePendingId !== null) return;', '');
    assert.throws(() => validatePhase7ActionReachability({
        plan: clone(planSource), sources: unguarded
    }), /not scoped to its row or guarded/);
});
