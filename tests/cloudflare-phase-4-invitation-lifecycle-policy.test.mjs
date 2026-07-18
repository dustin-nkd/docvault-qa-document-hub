import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    EVIDENCE,
    SOURCES,
    validatePhase4InvitationLifecycle
} from '../scripts/cloudflare-phase-4-invitation-lifecycle-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-4-invitation-lifecycle.json'),
        prerequisite: json('config/cloudflare/phase-4-central-rbac.json'),
        sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
        workersTestSource: read('tests/cloudflare/invitation-lifecycle.workers.test.ts'),
        routeSource: read('functions/api/v1/[[path]].ts'),
        wrangler: json('wrangler.jsonc'),
        migrationManifest: json('migrations/manifest.json'),
        evidenceSources: Object.fromEntries(EVIDENCE.map(evidenceId => [evidenceId,
            read(`docs/collaboration-foundation/evidence/phase-4/${evidenceId}.md`)]))
    };
}

test('CF-P4-004 locks identity-bound, single-use, digest-only invitation lifecycle', () => {
    assert.equal(validatePhase4InvitationLifecycle(actualInput()), true);
});

test('CF-P4-004 rejects token, provider, RBAC-order, acceptance, and test drift', () => {
    for (const mutate of [
        input => { input.sourceFiles['functions/_lib/invitations/token.ts'] = input.sourceFiles['functions/_lib/invitations/token.ts'].replace('random.bytes(32)', 'random.bytes(16)'); },
        input => { input.sourceFiles['functions/_lib/invitations/github-resolver.ts'] = input.sourceFiles['functions/_lib/invitations/github-resolver.ts'].replace("redirect: 'manual'", "redirect: 'follow'"); },
        input => { input.sourceFiles['functions/_lib/invitations/invitation-lifecycle.ts'] = input.sourceFiles['functions/_lib/invitations/invitation-lifecycle.ts'].replace("await authorize(database, 'invitation.create'", "void authorize(database, 'invitation.create'"); },
        input => { input.sourceFiles['functions/_lib/persistence/mutation-recipes.ts'] = input.sourceFiles['functions/_lib/persistence/mutation-recipes.ts'].replace("WHERE memberships.state = 'removed'", "WHERE memberships.state = 'active'"); },
        input => { input.workersTestSource = input.workersTestSource.replace('atomically replaces duplicate pending invitations', 'replacement omitted'); }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase4InvitationLifecycle(input));
    }
});

test('CF-P4-004 rejects route, migration, activation, evidence, and gate drift', () => {
    for (const mutate of [
        input => { input.routeSource += "\nimport { createInvitation } from '../../_lib/invitations';"; },
        input => { input.migrationManifest.entries.push({ sequence: 11 }); },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { delete input.evidenceSources['CF-EV-P4-SEC-004']; },
        input => { input.manifest.gate_authorization.id = 'P4-G2'; }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase4InvitationLifecycle(input));
    }
});

