import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, SOURCES, validatePhase4PreviewApi } from '../scripts/cloudflare-phase-4-preview-api-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-4-preview-api-integration.json'),
        prerequisite: json('config/cloudflare/phase-4-audit-scoped-reads.json'),
        sourceFiles: Object.fromEntries(SOURCES.map(file => [file, read(file)])),
        workersTestSource: read('tests/cloudflare/preview-api-integration.workers.test.ts'),
        wrangler: json('wrangler.jsonc'), migrationManifest: json('migrations/manifest.json'),
        evidenceSources: Object.fromEntries(EVIDENCE.map(evidenceId => [evidenceId,
            read(`docs/collaboration-foundation/evidence/phase-4/${evidenceId}.md`)])),
        report: read('docs/collaboration-foundation/phase-4-preview-api-integration.md')
    };
}

test('CF-P4-007 locks the isolated Preview API integration', () => {
    assert.equal(validatePhase4PreviewApi(actualInput()), true);
});

test('CF-P4-007 rejects request, routing, cursor, and coverage control drift', () => {
    for (const mutate of [
        input => { input.sourceFiles['functions/_lib/collaboration/runtime-handler.ts'] = input.sourceFiles['functions/_lib/collaboration/runtime-handler.ts'].replaceAll('verifyCsrfToken', 'trustCsrfHeader'); },
        input => { input.sourceFiles['functions/_lib/collaboration/runtime-handler.ts'] = input.sourceFiles['functions/_lib/collaboration/runtime-handler.ts'].replace('routeFor(pathname: string, method: string)', 'routeFor(pathname: string)'); },
        input => { input.sourceFiles['functions/_lib/collaboration/control-plane-cursor.ts'] = input.sourceFiles['functions/_lib/collaboration/control-plane-cursor.ts'].replaceAll('hmacVerify', 'compareSignature'); },
        input => { input.workersTestSource = input.workersTestSource.replace('fails closed on authentication', 'permits weak authentication'); }
    ]) {
        const input = actualInput(); mutate(input);
        assert.throws(() => validatePhase4PreviewApi(input));
    }
});

test('CF-P4-007 rejects production, migration, evidence, and gate drift', () => {
    for (const mutate of [
        input => { input.wrangler.env.production.d1_databases = [{ binding: 'COLLAB_DB' }]; },
        input => { input.migrationManifest.entries.push({ sequence: 11 }); },
        input => { delete input.evidenceSources['CF-EV-P4-SEC-007']; },
        input => { input.manifest.gate_authorization.id = 'P4-G5'; }
    ]) {
        const input = actualInput(); mutate(input);
        assert.throws(() => validatePhase4PreviewApi(input));
    }
});
