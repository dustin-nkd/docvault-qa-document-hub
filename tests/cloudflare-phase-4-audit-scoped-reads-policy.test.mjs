import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    EVIDENCE,
    SOURCES,
    validatePhase4AuditScopedReads
} from '../scripts/cloudflare-phase-4-audit-scoped-reads-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-4-audit-scoped-reads.json'),
        prerequisite: json('config/cloudflare/phase-4-membership-administration.json'),
        sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
        workersTestSource: read('tests/cloudflare/audit-scoped-reads.workers.test.ts'),
        routeSource: read('functions/api/v1/[[path]].ts'),
        wrangler: json('wrangler.jsonc'),
        migrationManifest: json('migrations/manifest.json'),
        evidenceSources: Object.fromEntries(EVIDENCE.map(evidenceId => [evidenceId,
            read(`docs/collaboration-foundation/evidence/phase-4/${evidenceId}.md`)]))
    };
}

test('CF-P4-006 locks tenant-scoped privacy-safe audit retrieval', () => {
    assert.equal(validatePhase4AuditScopedReads(actualInput()), true);
});

test('CF-P4-006 rejects authority, scope, cursor, registry, and coverage drift', () => {
    for (const mutate of [
        input => { input.sourceFiles['functions/_lib/audit/audit-reader.ts'] = input.sourceFiles['functions/_lib/audit/audit-reader.ts'].replace('workspace_id = ?', 'workspace_id IS NOT NULL'); },
        input => { input.sourceFiles['functions/_lib/audit/audit-reader.ts'] = input.sourceFiles['functions/_lib/audit/audit-reader.ts'].replaceAll('authorizeWorkspaceAction', 'trustClientRole'); },
        input => { input.sourceFiles['functions/_lib/audit/cursor.ts'] = input.sourceFiles['functions/_lib/audit/cursor.ts'].replaceAll('hmacVerify', 'compareSignature'); },
        input => { input.sourceFiles['functions/_lib/audit/event-registry.ts'] = input.sourceFiles['functions/_lib/audit/event-registry.ts'].replace('schemaVersion !== 8', 'schemaVersion < 1'); },
        input => { input.workersTestSource = input.workersTestSource.replace('repeats live authorization', 'trusts first-page authorization'); }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase4AuditScopedReads(input));
    }
});

test('CF-P4-006 rejects route, migration, activation, evidence, and gate drift', () => {
    for (const mutate of [
        input => { input.routeSource += "\nimport { listAuditEvents } from '../../_lib/audit';"; },
        input => { input.migrationManifest.entries.push({ sequence: 11 }); },
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { delete input.evidenceSources['CF-EV-P4-SEC-006']; },
        input => { input.manifest.gate_authorization.id = 'P4-G4'; }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase4AuditScopedReads(input));
    }
});
