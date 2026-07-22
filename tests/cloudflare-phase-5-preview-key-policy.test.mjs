import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVIDENCE, validatePhase5PreviewKeyFoundation } from '../scripts/cloudflare-phase-5-preview-key-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const input = () => ({
    manifest: json('config/cloudflare/phase-5-preview-key-foundation.json'),
    sprint: json('config/cloudflare/phase-5-sprint-plan.json'),
    wrangler: json('wrangler.jsonc'), migrationManifest: json('migrations/manifest.json'),
    handlerSource: read('functions/_lib/collaboration/key-runtime-handler.ts'),
    querySource: read('functions/_lib/workspace-keys/preview-key-queries.ts'),
    apiSource: read('functions/api/v1/[[path]].ts'),
    cursorSource: read('functions/_lib/collaboration/control-plane-cursor.ts'),
    workersTest: read('tests/cloudflare/preview-key-foundation.workers.test.ts'),
    reportSource: read('docs/collaboration-foundation/phase-5-preview-key-foundation.md'),
    evidenceSources: Object.fromEntries(EVIDENCE.map(id => [id,
        read(`docs/collaboration-foundation/evidence/phase-5/${id}.md`)]))
});

test('CF-P5-007 locks local integration while keeping remote Preview changes behind P5-G4', () => {
    assert.equal(validatePhase5PreviewKeyFoundation(input()), true);
});

test('CF-P5-007 rejects activation, production, bypass, migration, and premature evidence drift', () => {
    for (const [name, mutate] of [
        ['activation', value => { value.wrangler.env.preview.vars.KEY_FOUNDATION_MODE = 'preview-only'; }],
        ['production', value => { value.wrangler.env.production.d1_databases = [{}]; }],
        ['bypass', value => { value.handlerSource += '\nconst deployedTestBypass = true;'; }],
        ['migration', value => { value.migrationManifest.entries.push({ sequence: 13 }); }],
        ['evidence', value => { value.evidenceSources['CF-EV-P5-QA-003'] = '# CF-EV-P5-QA-003 x\n\nStatus: PASS'; }]
    ]) {
        const value = input(); mutate(value);
        assert.throws(() => validatePhase5PreviewKeyFoundation(value), undefined, name);
    }
});
