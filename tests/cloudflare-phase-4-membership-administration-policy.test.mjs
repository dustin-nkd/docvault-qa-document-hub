import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    EVIDENCE,
    SOURCES,
    validatePhase4MembershipAdministration
} from '../scripts/cloudflare-phase-4-membership-administration-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-4-membership-administration.json'),
        prerequisite: json('config/cloudflare/phase-4-invitation-lifecycle.json'),
        sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
        workersTestSource: read('tests/cloudflare/membership-administration.workers.test.ts'),
        routeSource: read('functions/api/v1/[[path]].ts'),
        wrangler: json('wrangler.jsonc'),
        migrationManifest: json('migrations/manifest.json'),
        evidenceSources: Object.fromEntries(EVIDENCE.map(evidenceId => [evidenceId,
            read(`docs/collaboration-foundation/evidence/phase-4/${evidenceId}.md`)]))
    };
}

test('CF-P4-005 locks live-authority atomic membership administration', () => {
    assert.equal(validatePhase4MembershipAdministration(actualInput()), true);
});

test('CF-P4-005 rejects RBAC, version, removal, transfer, and test drift', () => {
    for (const mutate of [
        input => { input.sourceFiles['functions/_lib/memberships/membership-administration.ts'] = input.sourceFiles['functions/_lib/memberships/membership-administration.ts'].replaceAll('authorizeWorkspaceAction', 'trustClientRole'); },
        input => { input.sourceFiles['functions/_lib/memberships/membership-administration.ts'] = input.sourceFiles['functions/_lib/memberships/membership-administration.ts'].replaceAll('role_version = role_version + 1', 'role_version = role_version'); },
        input => { input.sourceFiles['functions/_lib/memberships/membership-administration.ts'] = input.sourceFiles['functions/_lib/memberships/membership-administration.ts'].replaceAll("state = 'rotating'", "state = 'active'"); },
        input => { input.sourceFiles['functions/_lib/memberships/membership-administration.ts'] = input.sourceFiles['functions/_lib/memberships/membership-administration.ts'].replace("confirmation !== 'TRANSFER_OWNERSHIP'", 'confirmation.length === 0'); },
        input => { input.workersTestSource = input.workersTestSource.replace('atomically removes membership', 'removal omitted'); }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase4MembershipAdministration(input));
    }
});

test('CF-P4-005 rejects route, migration, activation, evidence, and gate drift', () => {
    for (const mutate of [
        input => { input.routeSource += "\nimport { changeMemberRole } from '../../_lib/memberships';"; },
        input => { input.migrationManifest.entries.push({ sequence: 11 }); },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { delete input.evidenceSources['CF-EV-P4-SEC-005']; },
        input => { input.manifest.gate_authorization.id = 'P4-G3'; }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase4MembershipAdministration(input));
    }
});
